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

const LOG_STREAM_TOPIC = 'CONTAINER_LOG';
const BASE_RECONNECT_MS = 1_000;
const MAX_RECONNECT_MS = 30_000;

interface WSLogMessage {
  type: string;
  containerId?: string;
  timestamp?: string;
  message?: string;
  stream?: string;
}

@Injectable()
export class LogStreamerProxyService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LogStreamerProxyService.name);
  private readonly logStreamerWsUrl: string;
  private readonly logStreamerUrl: string;
  private ws: WebSocket | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private isShuttingDown = false;
  private reconnectAttempts = 0;
  private activeSubscriptions = new Set<string>();

  constructor(
    private readonly httpService: HttpService,
    private readonly circuitBreaker: CircuitBreakerService,
    @Inject(PUB_SUB) private readonly pubSub: RedisPubSub,
    private readonly configService: ConfigService<Env>,
  ) {
    this.logStreamerWsUrl = this.configService.getOrThrow(
      'LOG_STREAMER_WS_URL',
      {
        infer: true,
      },
    );
    this.logStreamerUrl = this.configService.getOrThrow('LOG_STREAMER_URL', {
      infer: true,
    });
  }

  onModuleInit() {
    this.connectWebSocket();
  }

  onModuleDestroy() {
    this.isShuttingDown = true;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    if (this.ws) {
      this.ws.close();
    }
  }

  private connectWebSocket() {
    if (this.isShuttingDown) return;

    const wsUrl = this.logStreamerWsUrl;

    this.logger.log(`Connecting to log-streamer WebSocket at ${wsUrl}`);

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.on('open', () => {
        this.reconnectAttempts = 0;
        this.logger.log('Connected to log-streamer WebSocket');
        if (this.activeSubscriptions.size > 0) {
          this.logger.log(
            `Re-subscribing ${this.activeSubscriptions.size} active container(s)`,
          );
          for (const id of this.activeSubscriptions) {
            this.ws!.send(
              JSON.stringify({ type: 'subscribe', containerId: id }),
            );
          }
        }
      });

      this.ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString()) as WSLogMessage;
          if (message.type === 'log' && message.containerId) {
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
          } else if (message.type === 'error') {
            this.logger.warn(
              `Log-streamer error${message.containerId ? ` [container=${message.containerId}]` : ''}: ${message.message}`,
            );
          }
        } catch (error) {
          this.logger.error('Failed to parse WebSocket message', error);
        }
      });

      this.ws.on('close', () => {
        this.logger.warn('WebSocket connection closed');
        this.scheduleReconnect();
      });

      this.ws.on('error', (error) => {
        this.logger.error('WebSocket error', error);
      });
    } catch (error) {
      this.logger.error('Failed to create WebSocket connection', error);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.isShuttingDown) return;

    this.reconnectAttempts++;
    const delay = Math.min(
      BASE_RECONNECT_MS * 2 ** (this.reconnectAttempts - 1),
      MAX_RECONNECT_MS,
    );

    this.reconnectTimeout = setTimeout(() => {
      this.logger.log(
        `Attempting to reconnect to log-streamer (attempt ${this.reconnectAttempts}, next delay ${delay}ms)...`,
      );
      this.connectWebSocket();
    }, delay);
  }

  async subscribeToLogs(containerId: string) {
    const topic = `${LOG_STREAM_TOPIC}.${containerId}`;
    this.activeSubscriptions.add(containerId);

    // 1. Await Redis SUBSCRIBE completion before requesting data
    const preSubId = await this.pubSub.subscribe(topic, () => {});

    // 2. Create async iterator (channel already active → immediate resolve)
    const iterator = this.pubSub.asyncIterableIterator<{
      containerLog: {
        containerId: string;
        timestamp: string;
        message: string;
        stream: string;
      };
    }>(topic);

    // 3. Now request data from Log Streamer (Redis is ready to receive)
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'subscribe', containerId }));
    } else {
      this.logger.warn('WebSocket not connected, subscription may be delayed');
    }

    // 4. Wrap iterator to cleanup on subscription end
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    const originalReturn = iterator.return!.bind(iterator);

    return {
      next: iterator.next.bind(iterator),
      throw: iterator.throw!.bind(iterator),
      [Symbol.asyncIterator]() {
        return this;
      },
      async return() {
        self.activeSubscriptions.delete(containerId);
        self.unsubscribeFromLogs(containerId);
        const result = await originalReturn();
        self.pubSub.unsubscribe(preSubId);
        return result;
      },
    };
  }

  unsubscribeFromLogs(containerId: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'unsubscribe', containerId }));
    }
  }

  async listContainers(): Promise<Container[]> {
    return this.circuitBreaker.fire('log-streamer', async () => {
      const baseUrl = this.logStreamerUrl;
      const response = await firstValueFrom(
        this.httpService.get<Container[]>(`${baseUrl}/api/containers`),
      );
      return response.data;
    });
  }
}
