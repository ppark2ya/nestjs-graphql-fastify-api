import { ObjectType, Field } from '@nestjs/graphql';

@ObjectType({ description: 'Container log entry' })
export class LogEntry {
  @Field(() => String, { description: 'Container ID' })
  containerId: string;

  @Field(() => String, { description: 'Log timestamp (RFC3339 format)' })
  timestamp: string;

  @Field(() => String, { description: 'Log message content' })
  message: string;

  @Field(() => String, { description: 'Output stream: stdout or stderr' })
  stream: string;
}
