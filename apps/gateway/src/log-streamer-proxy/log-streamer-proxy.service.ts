import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
  Logger,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { CircuitBreakerService } from '../circuit-breaker/circuit-breaker.service';
import { PUB_SUB } from '../pubsub/pubsub.provider';
import { RedisPubSub } from 'graphql-redis-subscriptions';
import WebSocket from 'ws';
import { Container } from './models/container.model';

const LOG_STREAM_TOPIC = 'CONTAINER_LOG';

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
  private ws: WebSocket | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private isShuttingDown = false;

  constructor(
    private readonly httpService: HttpService,
    private readonly circuitBreaker: CircuitBreakerService,
    @Inject(PUB_SUB) private readonly pubSub: RedisPubSub,
  ) {}

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

    const wsUrl =
      process.env.LOG_STREAMER_WS_URL ?? 'ws://localhost:4003/ws/logs';

    this.logger.log(`Connecting to log-streamer WebSocket at ${wsUrl}`);

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.on('open', () => {
        this.logger.log('Connected to log-streamer WebSocket');
      });

      this.ws.on('message', (data: Buffer) => {
        try {
          const message: WSLogMessage = JSON.parse(data.toString());
          if (message.type === 'log' && message.containerId) {
            this.pubSub.publish(`${LOG_STREAM_TOPIC}.${message.containerId}`, {
              containerLog: {
                containerId: message.containerId,
                timestamp: message.timestamp,
                message: message.message,
                stream: message.stream,
              },
            });
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

    this.reconnectTimeout = setTimeout(() => {
      this.logger.log('Attempting to reconnect to log-streamer...');
      this.connectWebSocket();
    }, 5000);
  }

  subscribeToLogs(containerId: string) {
    if (
      this.ws &&
      this.ws.readyState === WebSocket.OPEN
    ) {
      this.ws.send(JSON.stringify({ type: 'subscribe', containerId }));
    } else {
      this.logger.warn(
        'WebSocket not connected, subscription may be delayed',
      );
    }
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
      const baseUrl =
        process.env.LOG_STREAMER_URL ?? 'http://localhost:4003';
      const response = await firstValueFrom(
        this.httpService.get<Container[]>(`${baseUrl}/api/containers`),
      );
      return response.data;
    });
  }
}
