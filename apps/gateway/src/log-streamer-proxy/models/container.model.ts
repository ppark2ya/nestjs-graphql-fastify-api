import { ObjectType, Field, Int } from '@nestjs/graphql';

@ObjectType({ description: 'Docker container information' })
export class Container {
  @Field(() => String, { description: 'Container ID (short format)' })
  id: string;

  @Field(() => String, { description: 'Container name' })
  name: string;

  @Field(() => String, { description: 'Image name' })
  image: string;

  @Field(() => String, { description: 'Container status (e.g., "Up 2 hours")' })
  status: string;

  @Field(() => String, { description: 'Container state (e.g., "running")' })
  state: string;

  @Field(() => Int, { description: 'Unix timestamp of container creation' })
  created: number;

  @Field(() => [String], { description: 'Port mappings' })
  ports: string[];

  @Field(() => String, {
    nullable: true,
    description: 'Swarm service name (null if not a swarm service)',
  })
  serviceName?: string;

  @Field(() => String, {
    nullable: true,
    description: 'Swarm task ID (null if not a swarm service)',
  })
  taskSlot?: string;

  @Field(() => String, {
    nullable: true,
    description: 'Swarm node hostname (null if not a swarm service)',
  })
  nodeName?: string;
}
