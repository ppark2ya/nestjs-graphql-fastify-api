const { createClient } = require('graphql-ws');
const WebSocket = require('ws');

const CONTAINER_ID = process.argv[2] || 'test-redis';
const WS_URL = 'ws://localhost:4000/graphql';

console.log(`Connecting to GraphQL Subscription at ${WS_URL}...`);
console.log(`Will subscribe to container logs: ${CONTAINER_ID}`);

const client = createClient({
  url: WS_URL,
  webSocketImpl: WebSocket,
  connectionParams: {
    'x-api-key': 'test-api-key',
  },
});

const subscription = client.iterate({
  query: `
    subscription {
      containerLog(containerId: "${CONTAINER_ID}") {
        containerId
        timestamp
        message
        stream
      }
    }
  `,
});

(async () => {
  console.log('Waiting for log messages...');

  let messageCount = 0;
  const maxMessages = 10;

  for await (const result of subscription) {
    if (result.data?.containerLog) {
      const log = result.data.containerLog;
      console.log(`[${log.stream}] ${log.timestamp}: ${log.message.slice(0, 100)}`);
      messageCount++;

      if (messageCount >= maxMessages) {
        console.log(`\nReceived ${maxMessages} messages, closing...`);
        break;
      }
    }
    if (result.errors) {
      console.error('Errors:', result.errors);
      break;
    }
  }

  client.dispose();
  process.exit(0);
})();

// Timeout after 15 seconds
setTimeout(() => {
  console.log('\nTimeout reached, closing...');
  client.dispose();
  process.exit(0);
}, 15000);
