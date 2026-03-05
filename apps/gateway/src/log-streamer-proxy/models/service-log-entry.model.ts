import { ObjectType, Field } from '@nestjs/graphql';

@ObjectType({ description: 'Service-level log entry (includes container lifecycle events)' })
export class ServiceLogEntry {
  @Field(() => String, { description: 'Container ID that produced the log' })
  containerId: string;

  @Field(() => String, { description: 'Swarm service name' })
  serviceName: string;

  @Field(() => String, { description: 'Log timestamp (RFC3339 format)' })
  timestamp: string;

  @Field(() => String, { description: 'Log message or event description' })
  message: string;

  @Field(() => String, {
    description: 'Output stream: stdout, stderr, or event',
  })
  stream: string;

  @Field(() => String, {
    nullable: true,
    description:
      'Container lifecycle event type: container_started, container_stopped, or null for regular logs',
  })
  event?: string | null;
}
