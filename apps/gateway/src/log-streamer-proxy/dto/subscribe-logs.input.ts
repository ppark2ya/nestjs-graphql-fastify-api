import { InputType, Field } from '@nestjs/graphql';

@InputType({ description: 'Input for subscribing to container logs' })
export class SubscribeLogsInput {
  @Field(() => String, { description: 'Container ID to subscribe to' })
  containerId: string;
}
