import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('WebhookQueue', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'pulsetel-webhook-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should queue webhook payloads', async () => {
    const { WebhookQueue } = await import('../src/webhook-queue');
    const queue = new WebhookQueue({ queueDir: tempDir });
    
    await queue.enqueue({
      url: 'https://example.com/webhook',
      payload: { event: 'test', data: 'hello' }
    });
    
    const files = readdirSync(tempDir);
    expect(files.length).toBeGreaterThan(0);
  });

  it('should persist queue to disk', async () => {
    const { WebhookQueue } = await import('../src/webhook-queue');
    const queue = new WebhookQueue({ queueDir: tempDir });
    
    await queue.enqueue({
      url: 'https://example.com/webhook',
      payload: { event: 'test' }
    });
    
    // Create new queue instance (simulating restart)
    const queue2 = new WebhookQueue({ queueDir: tempDir });
    const pending = await queue2.getPending();
    
    expect(pending.length).toBe(1);
    expect(pending[0].url).toBe('https://example.com/webhook');
  });

  it('should mark items as delivered', async () => {
    const { WebhookQueue } = await import('../src/webhook-queue');
    const queue = new WebhookQueue({ queueDir: tempDir });
    
    await queue.enqueue({
      url: 'https://example.com/webhook',
      payload: { event: 'test' }
    });
    
    const pending = await queue.getPending();
    expect(pending.length).toBe(1);
    
    await queue.markDelivered(pending[0].id);
    
    const pending2 = await queue.getPending();
    expect(pending2.length).toBe(0);
  });

  it('should track retry count', async () => {
    const { WebhookQueue } = await import('../src/webhook-queue');
    const queue = new WebhookQueue({ queueDir: tempDir });
    
    await queue.enqueue({
      url: 'https://example.com/webhook',
      payload: { event: 'test' }
    });
    
    const pending = await queue.getPending();
    expect(pending[0].retryCount).toBe(0);
    
    await queue.incrementRetry(pending[0].id);
    
    const pending2 = await queue.getPending();
    expect(pending2[0].retryCount).toBe(1);
  });

  it('should move failed items to dead letter queue after max retries', async () => {
    const { WebhookQueue } = await import('../src/webhook-queue');
    const queue = new WebhookQueue({ 
      queueDir: tempDir,
      maxRetries: 2
    });
    
    await queue.enqueue({
      url: 'https://example.com/webhook',
      payload: { event: 'test' }
    });
    
    const pending = await queue.getPending();
    await queue.incrementRetry(pending[0].id);
    await queue.incrementRetry(pending[0].id);
    
    const pending2 = await queue.getPending();
    expect(pending2.length).toBe(0);
    
    const dead = await queue.getDeadLetter();
    expect(dead.length).toBe(1);
    expect(dead[0].payload.event).toBe('test');
  });

  it('should clean up old delivered items', async () => {
    const { WebhookQueue } = await import('../src/webhook-queue');
    const queue = new WebhookQueue({ queueDir: tempDir });
    
    await queue.enqueue({
      url: 'https://example.com/webhook',
      payload: { event: 'test' }
    });
    
    const pending = await queue.getPending();
    await queue.markDelivered(pending[0].id);
    
    // Clean up
    await queue.cleanup(0); // 0 days = clean all delivered
    
    const files = readdirSync(join(tempDir, 'delivered'));
    // Should have cleaned up delivered items
    expect(files.length).toBe(0);
  });
});
