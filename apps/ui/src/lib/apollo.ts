import { ApolloClient, InMemoryCache, HttpLink, split } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { getMainDefinition } from '@apollo/client/utilities';
import { createClient } from 'graphql-ws';
import { getAccessToken } from '@/auth/token';

const API_KEY = 'test-api-key';

const httpLink = new HttpLink({
  uri: '/graphql',
});

const authLink = setContext((_, { headers }) => {
  const token = getAccessToken();
  return {
    headers: {
      ...headers,
      'X-API-Key': API_KEY,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
    return definition.kind === 'OperationDefinition' && definition.operation === 'subscription';
  },
  wsLink,
  authLink.concat(httpLink),
);

export const client = new ApolloClient({
  link: splitLink,
  cache: new InMemoryCache(),
});
