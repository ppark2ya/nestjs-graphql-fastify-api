import { ApolloClient, InMemoryCache, HttpLink, split } from '@apollo/client';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { getMainDefinition } from '@apollo/client/utilities';
import { createClient } from 'graphql-ws';

const API_KEY = 'test-api-key';

export function createApolloClient(gatewayUrl: string) {
  const httpLink = new HttpLink({
    uri: gatewayUrl,
    headers: {
      'X-API-Key': API_KEY,
    },
  });

  const wsUrl = gatewayUrl.replace(/^http/, 'ws');
  const wsLink = new GraphQLWsLink(
    createClient({
      url: wsUrl,
    }),
  );

  const splitLink = split(
    ({ query }) => {
      const definition = getMainDefinition(query);
      return (
        definition.kind === 'OperationDefinition' &&
        definition.operation === 'subscription'
      );
    },
    wsLink,
    httpLink,
  );

  return new ApolloClient({
    link: splitLink,
    cache: new InMemoryCache(),
  });
}
