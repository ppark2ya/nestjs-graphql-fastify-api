import { ObjectType, Field, Float } from '@nestjs/graphql';

@ObjectType({ description: 'Docker container resource usage statistics' })
export class ContainerStats {
  @Field(() => String, { description: 'Container ID (short format)' })
  id: string;

  @Field(() => String, { description: 'Container name' })
  name: string;

  @Field(() => Float, { description: 'CPU usage percentage' })
  cpuPercent: number;

  @Field(() => Float, { description: 'Memory usage in bytes' })
  memUsage: number;

  @Field(() => Float, { description: 'Memory limit in bytes' })
  memLimit: number;
}
