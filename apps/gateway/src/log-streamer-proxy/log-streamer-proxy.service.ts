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
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_INTERVAL_MS = 5_000;

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

    if (this.reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
      this.logger.error(
        `Gave up reconnecting to log-streamer after ${MAX_RECONNECT_ATTEMPTS} attempts. Log streaming is unavailable.`,
      );
      return;
    }

    this.reconnectTimeout = setTimeout(() => {
      this.logger.log(
        `Attempting to reconnect to log-streamer (${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`,
      );
      this.connectWebSocket();
    }, RECONNECT_INTERVAL_MS);
  }

  subscribeToLogs(containerId: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'subscribe', containerId }));
    } else {
      this.logger.warn('WebSocket not connected, subscription may be delayed');
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- graphql-redis-subscriptions asyncIterableIterator returns any
    return this.pubSub.asyncIterableIterator(
      `${LOG_STREAM_TOPIC}.${containerId}`,
    );
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
