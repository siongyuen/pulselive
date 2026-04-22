import { WebhookQueue } from '../src/webhook-queue';

async function main() {
  const queue = new WebhookQueue({ queueDir: '/tmp/test-debug-' + Date.now(), retryDelayMs: 0 });
  
  const entry = await queue.enqueue({
    url: 'https://example.com',
    payload: { test: true }
  });
  
  console.log('After enqueue:', entry);
  
  await queue.incrementRetry(entry.id);
  
  const pending = await queue.getPending();
  console.log('Pending after increment:', pending);
  
  const ready = await queue.getReadyForRetry();
  console.log('Ready for retry:', ready);
}

main();
