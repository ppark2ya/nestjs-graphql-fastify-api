import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { CircuitBreakerService } from '../circuit-breaker/circuit-breaker.service';
import { Env } from '../env.schema';
import { PUB_SUB } from '../pubsub/pubsub.provider';
import { RedisPubSub } from 'graphql-redis-subscriptions';
import WebSocket from 'ws';
import { Container } from './models/container.model';
import { ContainerStats } from './models/container-stats.model';
import { discoverLogStreamers } from '../common/discover-log-streamers';

const LOG_STREAM_TOPIC = 'CONTAINER_LOG';
const SERVICE_LOG_TOPIC = 'SERVICE_LOG';
const BASE_RECONNECT_MS = 1_000;
const MAX_RECONNECT_MS = 30_000;
const DNS_REFRESH_MS = 30_000;

interface WSLogMessage {
  type: string;
  containerId?: string;
  serviceName?: string;
  timestamp?: string;
  message?: string;
  stream?: string;
  event?: string;
}

export interface ContainerLogPayload {
  containerLog: {
    containerId: string;
    timestamp: string;
    message: string;
    stream: string;
  };
}

export interface ServiceLogPayload {
  serviceLog: {
    containerId: string;
    serviceName: string;
    timestamp: string;
    message: string;
    stream: string;
    event: string | null;
  };
}

class LogStreamerConnection {
  readonly host: string;
  readonly wsUrl: string;
  readonly httpUrl: string;
  ws: WebSocket | null = null;
  reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  reconnectAttempts = 0;

  constructor(host: string, port: number) {
    this.host = host;
    this.httpUrl = `http://${host}:${port}`;
    this.wsUrl = `ws://${host}:${port}/ws/logs`;
  }
}

@Injectable()
export class LogStreamerProxyService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LogStreamerProxyService.name);
  private readonly logStreamerPort: number;
  private readonly logStreamerBaseUrl: string;
  private readonly connections = new Map<string, LogStreamerConnection>();
  private dnsRefreshInterval: ReturnType<typeof setInterval> | null = null;
  private isShuttingDown = false;
  private activeSubscriptions = new Set<string>();
  private activeServiceSubscriptions = new Set<string>();

  constructor(
    private readonly httpService: HttpService,
    private readonly circuitBreaker: CircuitBreakerService,
    @Inject(PUB_SUB) private readonly pubSub: RedisPubSub,
    private readonly configService: ConfigService<Env>,
  ) {
    this.logStreamerPort = this.configService.getOrThrow('LOG_STREAMER_PORT', {
      infer: true,
    });
    this.logStreamerBaseUrl = this.configService.getOrThrow(
      'LOG_STREAMER_URL',
      {
        infer: true,
      },
    );
  }

  async onModuleInit() {
    await this.reconcileConnections();
    this.dnsRefreshInterval = setInterval(
      () => void this.reconcileConnections(),
      DNS_REFRESH_MS,
    );
  }

  onModuleDestroy() {
    this.isShuttingDown = true;
    if (this.dnsRefreshInterval) {
      clearInterval(this.dnsRefreshInterval);
    }
    for (const conn of this.connections.values()) {
      this.closeConnection(conn);
    }
    this.connections.clear();
  }

  private async reconcileConnections() {
    if (this.isShuttingDown) return;

    const hosts = await discoverLogStreamers(this.logStreamerBaseUrl);
    const currentHosts = new Set(this.connections.keys());
    const discoveredHosts = new Set(hosts);

    // Remove connections for hosts that are no longer discovered
    for (const host of currentHosts) {
      if (!discoveredHosts.has(host)) {
        this.logger.log(`Removing stale log-streamer connection: ${host}`);
        const conn = this.connections.get(host)!;
        this.closeConnection(conn);
        this.connections.delete(host);
      }
    }

    // Add connections for newly discovered hosts
    for (const host of discoveredHosts) {
      if (!currentHosts.has(host)) {
        this.logger.log(`Adding new log-streamer connection: ${host}`);
        const conn = new LogStreamerConnection(host, this.logStreamerPort);
        this.connections.set(host, conn);
        this.connectWebSocket(conn);
      }
    }
  }

  private connectWebSocket(conn: LogStreamerConnection) {
    if (this.isShuttingDown) return;

    this.logger.log(`Connecting to log-streamer WebSocket at ${conn.wsUrl}`);

    try {
      conn.ws = new WebSocket(conn.wsUrl);

      conn.ws.on('open', () => {
        conn.reconnectAttempts = 0;
        this.logger.log(`Connected to log-streamer WebSocket [${conn.host}]`);
        if (this.activeSubscriptions.size > 0) {
          this.logger.log(
            `Re-subscribing ${this.activeSubscriptions.size} active container(s) on [${conn.host}]`,
          );
          for (const id of this.activeSubscriptions) {
            conn.ws!.send(
              JSON.stringify({ type: 'subscribe', containerId: id }),
            );
          }
        }
        if (this.activeServiceSubscriptions.size > 0) {
          this.logger.log(
            `Re-subscribing ${this.activeServiceSubscriptions.size} active service(s) on [${conn.host}]`,
          );
          for (const svc of this.activeServiceSubscriptions) {
            conn.ws!.send(
              JSON.stringify({ type: 'subscribe_service', serviceName: svc }),
            );
          }
        }
      });

      conn.ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString()) as WSLogMessage;

          if (message.type === 'log' && message.containerId) {
            // Publish to container-specific topic (existing behavior)
            void this.pubSub.publish(
              `${LOG_STREAM_TOPIC}.${message.containerId}`,
              {
                containerLog: {
                  containerId: message.containerId,
                  timestamp: message.timestamp,
                  message: message.message,
                  stream: message.stream,
                },
              },
            );

            // If this log belongs to a service subscription, also publish to service topic
            if (message.serviceName) {
              void this.pubSub.publish(
                `${SERVICE_LOG_TOPIC}.${message.serviceName}`,
                {
                  serviceLog: {
                    containerId: message.containerId,
                    serviceName: message.serviceName,
                    timestamp: message.timestamp,
                    message: message.message,
                    stream: message.stream,
                    event: null,
                  },
                },
              );
            }
          } else if (message.type === 'service_event' && message.serviceName) {
            void this.pubSub.publish(
              `${SERVICE_LOG_TOPIC}.${message.serviceName}`,
              {
                serviceLog: {
                  containerId: message.containerId ?? '',
                  serviceName: message.serviceName,
                  timestamp: message.timestamp,
                  message: message.message,
                  stream: 'event',
                  event: message.event ?? null,
                },
              },
            );
          } else if (message.type === 'error') {
            this.logger.warn(
              `Log-streamer error [${conn.host}]${message.containerId ? ` [container=${message.containerId}]` : ''}${message.serviceName ? ` [service=${message.serviceName}]` : ''}: ${message.message}`,
            );
          }
        } catch (error) {
          this.logger.error(
            `Failed to parse WebSocket message [${conn.host}]`,
            error,
          );
        }
      });

      conn.ws.on('close', () => {
        this.logger.warn(`WebSocket connection closed [${conn.host}]`);
        this.scheduleReconnect(conn);
      });

      conn.ws.on('error', (error) => {
        this.logger.error(`WebSocket error [${conn.host}]`, error);
      });
    } catch (error) {
      this.logger.error(
        `Failed to create WebSocket connection [${conn.host}]`,
        error,
      );
      this.scheduleReconnect(conn);
    }
  }

  private scheduleReconnect(conn: LogStreamerConnection) {
    if (this.isShuttingDown) return;
    // Skip reconnect if the connection was removed during reconciliation
    if (!this.connections.has(conn.host)) return;

    conn.reconnectAttempts++;
    const delay = Math.min(
      BASE_RECONNECT_MS * 2 ** (conn.reconnectAttempts - 1),
      MAX_RECONNECT_MS,
    );

    conn.reconnectTimeout = setTimeout(() => {
      this.logger.log(
        `Attempting to reconnect to log-streamer [${conn.host}] (attempt ${conn.reconnectAttempts}, delay ${delay}ms)...`,
      );
      this.connectWebSocket(conn);
    }, delay);
  }

  private closeConnection(conn: LogStreamerConnection) {
    if (conn.reconnectTimeout) {
      clearTimeout(conn.reconnectTimeout);
      conn.reconnectTimeout = null;
    }
    if (conn.ws) {
      conn.ws.close();
      conn.ws = null;
    }
  }

  private broadcastToAll(message: string) {
    for (const conn of this.connections.values()) {
      if (conn.ws && conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.send(message);
      }
    }
  }

  async subscribeToLogs(containerId: string) {
    const topic = `${LOG_STREAM_TOPIC}.${containerId}`;
    this.activeSubscriptions.add(containerId);

    // 1. Await Redis SUBSCRIBE completion before requesting data
    const preSubId = await this.pubSub.subscribe(topic, () => {});

    // 2. Create async iterator (channel already active → immediate resolve)
    const iterator = this.pubSub.asyncIterableIterator<ContainerLogPayload>(
      topic,
    ) as AsyncIterableIterator<ContainerLogPayload>;

    // 3. Now request data from all Log Streamer instances (Redis is ready to receive)
    const subscribeMsg = JSON.stringify({ type: 'subscribe', containerId });
    this.broadcastToAll(subscribeMsg);

    if (this.connections.size === 0) {
      this.logger.warn(
        'No log-streamer connections available, subscription may be delayed',
      );
    }

    // 4. Wrap iterator to cleanup on subscription end
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    const originalReturn = iterator.return!.bind(iterator);

    const wrapper: AsyncIterableIterator<ContainerLogPayload> = {
      next: iterator.next.bind(iterator),
      throw: iterator.throw!.bind(iterator),
      [Symbol.asyncIterator]() {
        return wrapper;
      },
      async return(): Promise<IteratorResult<ContainerLogPayload>> {
        self.activeSubscriptions.delete(containerId);
        self.unsubscribeFromLogs(containerId);
        const result = await originalReturn();
        self.pubSub.unsubscribe(preSubId);
        return result;
      },
    };
    return wrapper;
  }

  async subscribeToServiceLogs(serviceName: string) {
    const topic = `${SERVICE_LOG_TOPIC}.${serviceName}`;
    this.activeServiceSubscriptions.add(serviceName);

    // 1. Await Redis SUBSCRIBE completion before requesting data
    const preSubId = await this.pubSub.subscribe(topic, () => {});

    // 2. Create async iterator (channel already active)
    const iterator = this.pubSub.asyncIterableIterator<ServiceLogPayload>(
      topic,
    ) as AsyncIterableIterator<ServiceLogPayload>;

    // 3. Send subscribe_service to all Log Streamer instances
    const subscribeMsg = JSON.stringify({
      type: 'subscribe_service',
      serviceName,
    });
    this.broadcastToAll(subscribeMsg);

    if (this.connections.size === 0) {
      this.logger.warn(
        'No log-streamer connections available, service subscription may be delayed',
      );
    }

    // 4. Wrap iterator to cleanup on subscription end
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    const originalReturn = iterator.return!.bind(iterator);

    const wrapper: AsyncIterableIterator<ServiceLogPayload> = {
      next: iterator.next.bind(iterator),
      throw: iterator.throw!.bind(iterator),
      [Symbol.asyncIterator]() {
        return wrapper;
      },
      async return(): Promise<IteratorResult<ServiceLogPayload>> {
        self.activeServiceSubscriptions.delete(serviceName);
        self.unsubscribeFromServiceLogs(serviceName);
        const result = await originalReturn();
        self.pubSub.unsubscribe(preSubId);
        return result;
      },
    };
    return wrapper;
  }

  unsubscribeFromLogs(containerId: string) {
    const unsubscribeMsg = JSON.stringify({
      type: 'unsubscribe',
      containerId,
    });
    this.broadcastToAll(unsubscribeMsg);
  }

  unsubscribeFromServiceLogs(serviceName: string) {
    const unsubscribeMsg = JSON.stringify({
      type: 'unsubscribe_service',
      serviceName,
    });
    this.broadcastToAll(unsubscribeMsg);
  }

  async listContainers(): Promise<Container[]> {
    const hosts = await discoverLogStreamers(this.logStreamerBaseUrl);
    const results = await Promise.allSettled(
      hosts.map((host) =>
        this.circuitBreaker.fire('log-streamer', async () => {
          const url = `http://${host}:${this.logStreamerPort}`;
          const response = await firstValueFrom(
            this.httpService.get<Container[]>(`${url}/api/containers`),
          );
          return response.data;
        }),
      ),
    );

    const containers: Container[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') {
        containers.push(...result.value);
      }
    }
    return containers;
  }

  async getContainerStats(containerIds: string[]): Promise<ContainerStats[]> {
    if (containerIds.length === 0) return [];

    const idsParam = containerIds.join(',');
    const hosts = await discoverLogStreamers(this.logStreamerBaseUrl);
    const results = await Promise.allSettled(
      hosts.map((host) =>
        this.circuitBreaker.fire('log-streamer', async () => {
          const url = `http://${host}:${this.logStreamerPort}`;
          const response = await firstValueFrom(
            this.httpService.get<ContainerStats[]>(
              `${url}/api/stats?ids=${idsParam}`,
            ),
          );
          return response.data;
        }),
      ),
    );

    const seen = new Set<string>();
    const stats: ContainerStats[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') {
        for (const s of result.value) {
          if (!seen.has(s.id)) {
            seen.add(s.id);
            stats.push(s);
          }
        }
      }
    }
    return stats;
  }
}
