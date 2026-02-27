import { ApolloClient, InMemoryCache, HttpLink, split } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { getMainDefinition } from '@apollo/client/utilities';
import { Kind, OperationTypeNode } from 'graphql';
import { createClient } from 'graphql-ws';
import { getAccessToken } from '@/auth/token';

const API_KEY = import.meta.env.VITE_API_KEY ?? 'test-api-key';

const httpLink = new HttpLink({
  uri: '/graphql',
});

const authLink = setContext((_, prevContext) => {
  const token = getAccessToken();
  const twoFactorToken = localStorage.getItem('twoFactorToken');
  const existingHeaders = (prevContext.headers ?? {}) as Record<string, string>;
  return {
    headers: {
      ...existingHeaders,
      'X-API-Key': API_KEY,
      'X-User-Type': 'ADMIN_BO',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(twoFactorToken ? { 'X-2FA-Token': twoFactorToken } : {}),
    },
  };
});

const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsLink = new GraphQLWsLink(
  createClient({
    url: `${wsProtocol}//${window.location.host}/graphql`,
    connectionParams: () => {
      const token = getAccessToken();
      return {
        'X-API-Key': API_KEY,
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      };
    },
  }),
);

const splitLink = split(
  ({ query }) => {
    const definition = getMainDefinition(query);
    return (
      definition.kind === Kind.OPERATION_DEFINITION &&
      definition.operation === OperationTypeNode.SUBSCRIPTION
    );
  },
  wsLink,
  authLink.concat(httpLink),
);

export const client = new ApolloClient({
  link: splitLink,
  cache: new InMemoryCache(),
});
