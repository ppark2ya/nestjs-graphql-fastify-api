const WebSocket = require('ws');

const WS_URL = process.env.WS_URL || 'ws://localhost:4003/ws/logs';
const CONTAINER_ID = process.argv[2] || 'test-redis';

console.log(`Connecting to ${WS_URL}...`);
console.log(`Will subscribe to container: ${CONTAINER_ID}`);

const ws = new WebSocket(WS_URL);

ws.on('open', () => {
  console.log('Connected!');
  console.log(`Subscribing to container: ${CONTAINER_ID}`);
  ws.send(JSON.stringify({ type: 'subscribe', containerId: CONTAINER_ID }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.type === 'log') {
    console.log(`[${msg.stream}] ${msg.timestamp}: ${msg.message}`);
  } else if (msg.type === 'error') {
    console.error('Error:', msg.message);
  }
});

ws.on('error', (err) => {
  console.error('WebSocket error:', err.message);
});

ws.on('close', () => {
  console.log('Connection closed');
});

// Auto-close after 10 seconds
setTimeout(() => {
  console.log('Unsubscribing and closing...');
  ws.send(JSON.stringify({ type: 'unsubscribe', containerId: CONTAINER_ID }));
  setTimeout(() => ws.close(), 1000);
}, 10000);
