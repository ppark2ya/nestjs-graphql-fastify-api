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
              if (key === 'LOG_STREAMER_WS_URL')
                return 'ws://localhost:4003/ws/logs';
              if (key === 'LOG_STREAMER_URL') return 'http://localhost:4003';
              return '';
            }),
          },
        },
      ],
    }).compile();

    service = module.get<LogStreamerProxyService>(LogStreamerProxyService);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('onModuleInit', () => {
    it('should create a WebSocket connection', () => {
      service.onModuleInit();
      expect(MockWebSocket).toHaveBeenCalledWith(
        'ws://localhost:4003/ws/logs',
      );
    });
  });

  describe('subscribeToLogs — race condition fix', () => {
    beforeEach(() => {
      service.onModuleInit();
      // Simulate ws open
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

      // Access private field for verification
      const activeSubscriptions = (service as any).activeSubscriptions as Set<string>;
      expect(activeSubscriptions.has('container-abc')).toBe(true);
    });

    it('should warn but not throw when WS is not connected', async () => {
      mockWsInstance.readyState = WebSocket.CLOSED;

      const iterator = await service.subscribeToLogs('container-abc');
      expect(iterator).toBeDefined();
      // WS send should not be called when not OPEN
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

  describe('iterator.return() — cleanup', () => {
    beforeEach(() => {
      service.onModuleInit();
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

  describe('WebSocket reconnect — re-subscribe active containers', () => {
    it('should re-subscribe all active containers on reconnect', async () => {
      service.onModuleInit();
      mockWsInstance.handlers['open']?.();

      // Subscribe to two containers
      await service.subscribeToLogs('container-1');
      await service.subscribeToLogs('container-2');
      mockWsInstance.send.mockClear();

      // Simulate reconnect: close triggers scheduleReconnect
      mockWsInstance.handlers['close']?.();

      // Reset mock for new WS instance
      const newWsHandlers: Record<string, (...args: unknown[]) => void> = {};
      MockWebSocket.mockImplementation(() => {
        const newInstance = {
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
        // Update the reference so service uses the new instance
        (service as any).ws = newInstance;
        return newInstance as unknown as WebSocket;
      });

      // Advance timer to trigger reconnect (1s for first attempt)
      jest.advanceTimersByTime(1000);

      // Simulate open on new connection
      newWsHandlers['open']?.();

      const ws = (service as any).ws;
      // Should have re-subscribed both containers
      const sendCalls = ws.send.mock.calls.map(
        (call: string[]) => JSON.parse(call[0]),
      );
      expect(sendCalls).toEqual(
        expect.arrayContaining([
          { type: 'subscribe', containerId: 'container-1' },
          { type: 'subscribe', containerId: 'container-2' },
        ]),
      );
    });
  });

  describe('scheduleReconnect — exponential backoff', () => {
    it('should use exponential backoff delays', () => {
      service.onModuleInit();
      mockWsInstance.handlers['open']?.();
      const baseline = MockWebSocket.mock.calls.length;

      // First close → attempt 1 → delay = 1000ms
      mockWsInstance.handlers['close']?.();

      // Should not reconnect before 1000ms
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

    it('should cap delay at MAX_RECONNECT_MS (30s)', () => {
      service.onModuleInit();
      mockWsInstance.handlers['open']?.();
      const baseline = MockWebSocket.mock.calls.length;

      // Force many attempts to hit the cap
      for (let i = 0; i < 10; i++) {
        mockWsInstance.handlers['close']?.();
        jest.advanceTimersByTime(30_001);
      }

      // Should still be reconnecting (no max attempts limit)
      expect(MockWebSocket.mock.calls.length - baseline).toBeGreaterThan(5);
    });

    it('should not reconnect when shutting down', () => {
      service.onModuleInit();
      mockWsInstance.handlers['open']?.();
      const baseline = MockWebSocket.mock.calls.length;

      service.onModuleDestroy();
      mockWsInstance.handlers['close']?.();

      jest.advanceTimersByTime(60_000);
      // No additional connections after shutdown
      expect(MockWebSocket).toHaveBeenCalledTimes(baseline);
    });
  });

  describe('WebSocket message handling', () => {
    it('should publish log messages to Redis PubSub', () => {
      service.onModuleInit();
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

    it('should not publish non-log messages', () => {
      service.onModuleInit();
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
    it('should close WebSocket and prevent reconnect', () => {
      service.onModuleInit();
      mockWsInstance.handlers['open']?.();

      service.onModuleDestroy();

      expect(mockWsInstance.close).toHaveBeenCalled();
      expect((service as any).isShuttingDown).toBe(true);
    });
  });

  describe('unsubscribeFromLogs', () => {
    it('should send unsubscribe message when WS is open', () => {
      service.onModuleInit();
      mockWsInstance.handlers['open']?.();

      service.unsubscribeFromLogs('container-abc');

      expect(mockWsInstance.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'unsubscribe', containerId: 'container-abc' }),
      );
    });

    it('should not send when WS is closed', () => {
      service.onModuleInit();
      mockWsInstance.readyState = WebSocket.CLOSED;

      service.unsubscribeFromLogs('container-abc');

      expect(mockWsInstance.send).not.toHaveBeenCalled();
    });
  });
});
