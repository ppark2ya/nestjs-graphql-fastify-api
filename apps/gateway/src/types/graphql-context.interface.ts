import { FastifyRequest, FastifyReply } from 'fastify';
import { IDataLoaders } from '../dataloader/dataloader.interface';

export interface GraphQLContext {
  req: FastifyRequest;
  reply?: FastifyReply;
  loaders: IDataLoaders;
}
