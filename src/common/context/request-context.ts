import { AsyncLocalStorage } from 'async_hooks';

export interface RequestStore {
  authToken?: string;
  correlationId?: string;
}

export const requestContext = new AsyncLocalStorage<RequestStore>();
