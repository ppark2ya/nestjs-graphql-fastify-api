import { Resolver, Query, Subscription, Args } from '@nestjs/graphql';
import { LogStreamerProxyService } from './log-streamer-proxy.service';
import { Container } from './models/container.model';
import { ContainerStats } from './models/container-stats.model';
import { LogEntry } from './models/log-entry.model';
import { ServiceLogEntry } from './models/service-log-entry.model';
import { Public } from '../auth/public.decorator';

@Resolver()
export class LogStreamerProxyResolver {
  constructor(private readonly service: LogStreamerProxyService) {}

  @Query(() => [Container], { description: 'List all Docker containers' })
  async containers(): Promise<Container[]> {
    return this.service.listContainers();
  }

  @Query(() => [ContainerStats], {
    description: 'Get resource usage statistics for specified containers',
  })
  async containerStats(
    @Args('containerIds', { type: () => [String] }) containerIds: string[],
  ): Promise<ContainerStats[]> {
    return this.service.getContainerStats(containerIds);
  }

  @Public()
  @Subscription(() => LogEntry, {
    description: 'Subscribe to container logs',
  })
  async containerLog(@Args('containerId') containerId: string) {
    return this.service.subscribeToLogs(containerId);
  }

  @Public()
  @Subscription(() => ServiceLogEntry, {
    description:
      'Subscribe to all logs from a service (auto-recovers on container restart)',
  })
  async serviceLog(@Args('serviceName') serviceName: string) {
    return this.service.subscribeToServiceLogs(serviceName);
  }
}
