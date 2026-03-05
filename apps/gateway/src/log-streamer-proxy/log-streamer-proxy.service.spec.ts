import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { LogStreamerProxyService } from './log-streamer-proxy.service';
import { CircuitBreakerService } from '../circuit-breaker/circuit-breaker.service';
import { PUB_SUB } from '../pubsub/pubsub.provider';
import WebSocket from 'ws';

// --- Mock ws module ---
jest.mock('ws');
const MockWebSocket = WebSocket as jest.MockedClass<typeof WebSocket>;

// --- Mock discoverLogStreamers ---
jest.mock('../common/discover-log-streamers', () => ({
  discoverLogStreamers: jest.fn().mockResolvedValue(['localhost']),
}));

describe('LogStreamerProxyService', () => {
  let service: LogStreamerProxyService;
  let mockPubSub: {
    subscribe: jest.Mock;
    asyncIterableIterator: jest.Mock;
    publish: jest.Mock;
    unsubscribe: jest.Mock;
  };
  let mockWsInstance: {
    on: jest.Mock;
    send: jest.Mock;
    close: jest.Mock;
    readyState: number;
    handlers: Record<string, (...args: unknown[]) => void>;
  };

  beforeEach(async () => {
    jest.useFakeTimers();

    mockPubSub = {
      subscribe: jest.fn().mockResolvedValue(42),
      asyncIterableIterator: jest.fn().mockReturnValue({
        next: jest.fn().mockResolvedValue({ value: undefined, done: false }),
        return: jest
          .fn()
          .mockResolvedValue({ value: undefined, done: true }),
        throw: jest.fn(),
        [Symbol.asyncIterator]() {
          return this;
        },
      }),
      publish: jest.fn().mockResolvedValue(undefined),
      unsubscribe: jest.fn(),
    };

    // Capture WS event handlers
    mockWsInstance = {
      on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
        mockWsInstance.handlers[event] = handler;
      }),
      send: jest.fn(),
      close: jest.fn(),
      readyState: WebSocket.OPEN,
      handlers: {},
    };
    MockWebSocket.mockImplementation(() => mockWsInstance as unknown as WebSocket);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LogStreamerProxyService,
        {
          provide: HttpService,
          useValue: { get: jest.fn() },
        },
        {
          provide: CircuitBreakerService,
          useValue: { fire: jest.fn() },
        },
        {
          provide: PUB_SUB,
          useValue: mockPubSub,
        },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn((key: string) => {
              if (key === 'LOG_STREAMER_URL') return 'http://localhost:4003';
              if (key === 'LOG_STREAMER_PORT') return 4003;
              return '';
            }),
          },
        },
      ],
    }).compile();

    service = module.get<LogStreamerProxyService>(LogStreamerProxyService);
  });

  afterEach(() => {
    service.onModuleDestroy();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('onModuleInit', () => {
    it('should create a WebSocket connection', async () => {
      await service.onModuleInit();
      expect(MockWebSocket).toHaveBeenCalledWith(
        'ws://localhost:4003/ws/logs',
      );
    });
  });

  describe('subscribeToLogs — race condition fix', () => {
    beforeEach(async () => {
      await service.onModuleInit();
      mockWsInstance.handlers['open']?.();
    });

    it('should await pubSub.subscribe BEFORE sending WS subscribe', async () => {
      const callOrder: string[] = [];

      mockPubSub.subscribe.mockImplementation(async () => {
        callOrder.push('redis-subscribe');
        return 42;
      });
      mockWsInstance.send.mockImplementation(() => {
        callOrder.push('ws-send');
      });

      await service.subscribeToLogs('container-123');

      expect(callOrder).toEqual(['redis-subscribe', 'ws-send']);
    });

    it('should call pubSub.subscribe with correct topic', async () => {
      await service.subscribeToLogs('container-abc');

      expect(mockPubSub.subscribe).toHaveBeenCalledWith(
        'CONTAINER_LOG.container-abc',
        expect.any(Function),
      );
    });

    it('should create asyncIterableIterator with correct topic', async () => {
      await service.subscribeToLogs('container-abc');

      expect(mockPubSub.asyncIterableIterator).toHaveBeenCalledWith(
        'CONTAINER_LOG.container-abc',
      );
    });

    it('should send WS subscribe message with containerId', async () => {
      await service.subscribeToLogs('container-abc');

      expect(mockWsInstance.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'subscribe', containerId: 'container-abc' }),
      );
    });

    it('should track containerId in activeSubscriptions', async () => {
      await service.subscribeToLogs('container-abc');

      const activeSubscriptions = (service as any).activeSubscriptions as Set<string>;
      expect(activeSubscriptions.has('container-abc')).toBe(true);
    });

    it('should warn but not throw when WS is not connected', async () => {
      mockWsInstance.readyState = WebSocket.CLOSED;

      const iterator = await service.subscribeToLogs('container-abc');
      expect(iterator).toBeDefined();
      expect(mockWsInstance.send).not.toHaveBeenCalled();
    });

    it('should return an async iterable iterator', async () => {
      const iterator = await service.subscribeToLogs('container-abc');

      expect(iterator[Symbol.asyncIterator]).toBeDefined();
      expect(typeof iterator.next).toBe('function');
      expect(typeof iterator.return).toBe('function');
      expect(typeof iterator.throw).toBe('function');
    });
  });

  describe('subscribeToServiceLogs', () => {
    beforeEach(async () => {
      await service.onModuleInit();
      mockWsInstance.handlers['open']?.();
    });

    it('should subscribe to Redis with SERVICE_LOG topic', async () => {
      await service.subscribeToServiceLogs('my-service');

      expect(mockPubSub.subscribe).toHaveBeenCalledWith(
        'SERVICE_LOG.my-service',
        expect.any(Function),
      );
    });

    it('should send subscribe_service WS message', async () => {
      await service.subscribeToServiceLogs('my-service');

      expect(mockWsInstance.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'subscribe_service', serviceName: 'my-service' }),
      );
    });

    it('should track serviceName in activeServiceSubscriptions', async () => {
      await service.subscribeToServiceLogs('my-service');

      const active = (service as any).activeServiceSubscriptions as Set<string>;
      expect(active.has('my-service')).toBe(true);
    });

    it('should cleanup on iterator.return()', async () => {
      mockPubSub.subscribe.mockResolvedValue(77);
      const iterator = await service.subscribeToServiceLogs('my-service');
      mockWsInstance.send.mockClear();

      await iterator.return!();

      const active = (service as any).activeServiceSubscriptions as Set<string>;
      expect(active.has('my-service')).toBe(false);
      expect(mockWsInstance.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'unsubscribe_service', serviceName: 'my-service' }),
      );
      expect(mockPubSub.unsubscribe).toHaveBeenCalledWith(77);
    });
  });

  describe('iterator.return() — cleanup', () => {
    beforeEach(async () => {
      await service.onModuleInit();
      mockWsInstance.handlers['open']?.();
    });

    it('should remove containerId from activeSubscriptions', async () => {
      const iterator = await service.subscribeToLogs('container-abc');
      const activeSubscriptions = (service as any).activeSubscriptions as Set<string>;

      expect(activeSubscriptions.has('container-abc')).toBe(true);

      await iterator.return!();

      expect(activeSubscriptions.has('container-abc')).toBe(false);
    });

    it('should send WS unsubscribe message', async () => {
      const iterator = await service.subscribeToLogs('container-abc');
      mockWsInstance.send.mockClear();

      await iterator.return!();

      expect(mockWsInstance.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'unsubscribe', containerId: 'container-abc' }),
      );
    });

    it('should unsubscribe preSubId from pubSub', async () => {
      mockPubSub.subscribe.mockResolvedValue(99);

      const iterator = await service.subscribeToLogs('container-abc');
      await iterator.return!();

      expect(mockPubSub.unsubscribe).toHaveBeenCalledWith(99);
    });

    it('should call original iterator.return()', async () => {
      const mockReturn = jest
        .fn()
        .mockResolvedValue({ value: undefined, done: true });
      mockPubSub.asyncIterableIterator.mockReturnValue({
        next: jest.fn(),
        return: mockReturn,
        throw: jest.fn(),
        [Symbol.asyncIterator]() {
          return this;
        },
      });

      const iterator = await service.subscribeToLogs('container-abc');
      await iterator.return!();

      expect(mockReturn).toHaveBeenCalled();
    });
  });

  describe('WebSocket reconnect — re-subscribe active containers and services', () => {
    it('should re-subscribe all active containers and services on reconnect', async () => {
      await service.onModuleInit();
      mockWsInstance.handlers['open']?.();

      // Subscribe to two containers and one service
      await service.subscribeToLogs('container-1');
      await service.subscribeToLogs('container-2');
      await service.subscribeToServiceLogs('my-service');
      mockWsInstance.send.mockClear();

      // Simulate reconnect: close triggers scheduleReconnect
      mockWsInstance.handlers['close']?.();

      // Reset mock for new WS instance
      const newWsHandlers: Record<string, (...args: unknown[]) => void> = {};
      const newWsInstance = {
        on: jest.fn(
          (event: string, handler: (...args: unknown[]) => void) => {
            newWsHandlers[event] = handler;
          },
        ),
        send: jest.fn(),
        close: jest.fn(),
        readyState: WebSocket.OPEN,
        handlers: newWsHandlers,
      };
      MockWebSocket.mockImplementation(() => newWsInstance as unknown as WebSocket);

      // Advance timer to trigger reconnect (1s for first attempt)
      jest.advanceTimersByTime(1000);

      // Simulate open on new connection
      newWsHandlers['open']?.();

      const sendCalls = newWsInstance.send.mock.calls.map(
        (call: string[]) => JSON.parse(call[0]),
      );
      expect(sendCalls).toEqual(
        expect.arrayContaining([
          { type: 'subscribe', containerId: 'container-1' },
          { type: 'subscribe', containerId: 'container-2' },
          { type: 'subscribe_service', serviceName: 'my-service' },
        ]),
      );
    });
  });

  describe('scheduleReconnect — exponential backoff', () => {
    it('should use exponential backoff delays', async () => {
      await service.onModuleInit();
      mockWsInstance.handlers['open']?.();
      const baseline = MockWebSocket.mock.calls.length;

      // First close → attempt 1 → delay = 1000ms
      mockWsInstance.handlers['close']?.();

      jest.advanceTimersByTime(999);
      expect(MockWebSocket).toHaveBeenCalledTimes(baseline);

      jest.advanceTimersByTime(1);
      expect(MockWebSocket).toHaveBeenCalledTimes(baseline + 1);

      // Second close → attempt 2 → delay = 2000ms
      mockWsInstance.handlers['close']?.();
      jest.advanceTimersByTime(1999);
      expect(MockWebSocket).toHaveBeenCalledTimes(baseline + 1);
      jest.advanceTimersByTime(1);
      expect(MockWebSocket).toHaveBeenCalledTimes(baseline + 2);
    });

    it('should cap delay at MAX_RECONNECT_MS (30s)', async () => {
      await service.onModuleInit();
      mockWsInstance.handlers['open']?.();
      const baseline = MockWebSocket.mock.calls.length;

      for (let i = 0; i < 10; i++) {
        mockWsInstance.handlers['close']?.();
        jest.advanceTimersByTime(30_001);
      }

      expect(MockWebSocket.mock.calls.length - baseline).toBeGreaterThan(5);
    });

    it('should not reconnect when shutting down', async () => {
      await service.onModuleInit();
      mockWsInstance.handlers['open']?.();
      const baseline = MockWebSocket.mock.calls.length;

      service.onModuleDestroy();
      mockWsInstance.handlers['close']?.();

      jest.advanceTimersByTime(60_000);
      expect(MockWebSocket).toHaveBeenCalledTimes(baseline);
    });
  });

  describe('WebSocket message handling', () => {
    it('should publish log messages to Redis PubSub', async () => {
      await service.onModuleInit();
      mockWsInstance.handlers['open']?.();

      const logMessage = JSON.stringify({
        type: 'log',
        containerId: 'abc',
        timestamp: '2026-01-01T00:00:00Z',
        message: 'test log',
        stream: 'stdout',
      });

      mockWsInstance.handlers['message']?.(Buffer.from(logMessage));

      expect(mockPubSub.publish).toHaveBeenCalledWith('CONTAINER_LOG.abc', {
        containerLog: {
          containerId: 'abc',
          timestamp: '2026-01-01T00:00:00Z',
          message: 'test log',
          stream: 'stdout',
        },
      });
    });

    it('should publish service log messages to both container and service topics', async () => {
      await service.onModuleInit();
      mockWsInstance.handlers['open']?.();

      const logMessage = JSON.stringify({
        type: 'log',
        containerId: 'abc',
        serviceName: 'my-service',
        timestamp: '2026-01-01T00:00:00Z',
        message: 'service log',
        stream: 'stdout',
      });

      mockWsInstance.handlers['message']?.(Buffer.from(logMessage));

      expect(mockPubSub.publish).toHaveBeenCalledWith('CONTAINER_LOG.abc', {
        containerLog: {
          containerId: 'abc',
          timestamp: '2026-01-01T00:00:00Z',
          message: 'service log',
          stream: 'stdout',
        },
      });
      expect(mockPubSub.publish).toHaveBeenCalledWith('SERVICE_LOG.my-service', {
        serviceLog: {
          containerId: 'abc',
          serviceName: 'my-service',
          timestamp: '2026-01-01T00:00:00Z',
          message: 'service log',
          stream: 'stdout',
          event: null,
        },
      });
    });

    it('should publish service_event messages to service topic', async () => {
      await service.onModuleInit();
      mockWsInstance.handlers['open']?.();

      const eventMessage = JSON.stringify({
        type: 'service_event',
        containerId: 'abc',
        serviceName: 'my-service',
        timestamp: '2026-01-01T00:00:00Z',
        message: 'Container abc started',
        event: 'container_started',
      });

      mockWsInstance.handlers['message']?.(Buffer.from(eventMessage));

      expect(mockPubSub.publish).toHaveBeenCalledWith('SERVICE_LOG.my-service', {
        serviceLog: {
          containerId: 'abc',
          serviceName: 'my-service',
          timestamp: '2026-01-01T00:00:00Z',
          message: 'Container abc started',
          stream: 'event',
          event: 'container_started',
        },
      });
    });

    it('should not publish non-log messages', async () => {
      await service.onModuleInit();
      mockWsInstance.handlers['open']?.();

      const errorMessage = JSON.stringify({
        type: 'error',
        message: 'something went wrong',
      });

      mockWsInstance.handlers['message']?.(Buffer.from(errorMessage));

      expect(mockPubSub.publish).not.toHaveBeenCalled();
    });
  });

  describe('onModuleDestroy', () => {
    it('should close WebSocket and prevent reconnect', async () => {
      await service.onModuleInit();
      mockWsInstance.handlers['open']?.();

      service.onModuleDestroy();

      expect(mockWsInstance.close).toHaveBeenCalled();
      expect((service as any).isShuttingDown).toBe(true);
    });
  });

  describe('unsubscribeFromLogs', () => {
    it('should send unsubscribe message when WS is open', async () => {
      await service.onModuleInit();
      mockWsInstance.handlers['open']?.();

      service.unsubscribeFromLogs('container-abc');

      expect(mockWsInstance.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'unsubscribe', containerId: 'container-abc' }),
      );
    });

    it('should not send when WS is closed', async () => {
      await service.onModuleInit();
      mockWsInstance.readyState = WebSocket.CLOSED;

      service.unsubscribeFromLogs('container-abc');

      expect(mockWsInstance.send).not.toHaveBeenCalled();
    });
  });

  describe('unsubscribeFromServiceLogs', () => {
    it('should send unsubscribe_service message when WS is open', async () => {
      await service.onModuleInit();
      mockWsInstance.handlers['open']?.();

      service.unsubscribeFromServiceLogs('my-service');

      expect(mockWsInstance.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'unsubscribe_service', serviceName: 'my-service' }),
      );
    });
  });
});
