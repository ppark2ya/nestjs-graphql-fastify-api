import { Resolver, Query, Subscription, Args } from '@nestjs/graphql';
import { LogStreamerProxyService } from './log-streamer-proxy.service';
import { Container } from './models/container.model';
import { LogEntry } from './models/log-entry.model';
import { Public } from '../auth/public.decorator';

@Resolver()
export class LogStreamerProxyResolver {
  constructor(private readonly service: LogStreamerProxyService) {}

  @Query(() => [Container], { description: 'List all Docker containers' })
  async containers(): Promise<Container[]> {
    return this.service.listContainers();
  }

  @Public()
  @Subscription(() => LogEntry, {
    description: 'Subscribe to container logs',
  })
  containerLog(@Args('containerId') containerId: string) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- graphql-redis-subscriptions asyncIterableIterator returns any
    return this.service.subscribeToLogs(containerId);
  }
}
