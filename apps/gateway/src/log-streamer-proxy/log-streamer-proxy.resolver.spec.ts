import { LogStreamerProxyResolver } from './log-streamer-proxy.resolver';
import { LogStreamerProxyService } from './log-streamer-proxy.service';

describe('LogStreamerProxyResolver', () => {
  let resolver: LogStreamerProxyResolver;
  let mockService: jest.Mocked<Pick<LogStreamerProxyService, 'subscribeToLogs' | 'listContainers'>>;

  beforeEach(() => {
    mockService = {
      subscribeToLogs: jest.fn(),
      listContainers: jest.fn(),
    };
    resolver = new LogStreamerProxyResolver(
      mockService as unknown as LogStreamerProxyService,
    );
  });

  describe('containerLog', () => {
    it('should be an async function', () => {
      // The method must be async to properly await the service
      const result = resolver.containerLog('test-id');
      expect(result).toBeInstanceOf(Promise);
    });

    it('should call service.subscribeToLogs with containerId', async () => {
      const mockIterator = {
        next: jest.fn(),
        return: jest.fn(),
        throw: jest.fn(),
        [Symbol.asyncIterator]() {
          return this;
        },
      };
      mockService.subscribeToLogs.mockResolvedValue(mockIterator as any);

      const result = await resolver.containerLog('container-123');

      expect(mockService.subscribeToLogs).toHaveBeenCalledWith(
        'container-123',
      );
      expect(result).toBe(mockIterator);
    });

    it('should propagate errors from service', async () => {
      mockService.subscribeToLogs.mockRejectedValue(
        new Error('Redis connection failed'),
      );

      await expect(resolver.containerLog('container-123')).rejects.toThrow(
        'Redis connection failed',
      );
    });
  });

  describe('containers', () => {
    it('should call service.listContainers', async () => {
      const mockContainers = [
        {
          id: 'abc',
          name: 'test',
          image: 'node:20',
          status: 'Up',
          state: 'running',
          created: 1000,
          ports: [],
        },
      ];
      mockService.listContainers.mockResolvedValue(mockContainers);

      const result = await resolver.containers();

      expect(mockService.listContainers).toHaveBeenCalled();
      expect(result).toEqual(mockContainers);
    });
  });
});
