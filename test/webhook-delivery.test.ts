import { describe, it, expect, vi } from 'vitest';

describe('WebhookDelivery', () => {
  it('should deliver a webhook successfully', async () => {
    const { WebhookDelivery } = await import('../src/webhook-delivery');
    const queueDir = '/tmp/test-webhook-delivery-' + Date.now();
    const delivery = new WebhookDelivery({ queueDir });
    
    // Mock fetch for testing
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    (delivery as any).fetch = mockFetch;
    
    const entry = await delivery.queue.enqueue({
      url: 'https://example.com/webhook',
      payload: { event: 'test' }
    });
    
    // Process the queue
    await delivery.processQueue();
    
    // Verify webhook was delivered
    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/webhook',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ event: 'test' })
      })
    );
    
    // Verify entry was marked as delivered
    const pending = await delivery.queue.getPending();
    expect(pending.length).toBe(0);
  });

  it('should retry failed webhooks', async () => {
    const { WebhookDelivery } = await import('../src/webhook-delivery');
    const queueDir = '/tmp/test-webhook-delivery-' + Date.now();
    const delivery = new WebhookDelivery({ queueDir, retryDelayMs: 0 });
    
    // First call fails, second succeeds
    const mockFetch = vi.fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({ ok: true, status: 200 });
    (delivery as any).fetch = mockFetch;
    
    await delivery.queue.enqueue({
      url: 'https://example.com/webhook',
      payload: { event: 'test' }
    });
    
    // First attempt - should fail
    await delivery.processQueue();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    
    // Entry should still be pending (retry)
    const pending1 = await delivery.queue.getPending();
    expect(pending1.length).toBe(1);
    expect(pending1[0].retryCount).toBe(1);
    
    // Second attempt - should succeed (retryDelayMs is 0)
    await delivery.processQueue();
    expect(mockFetch).toHaveBeenCalledTimes(2);
    
    const pending2 = await delivery.queue.getPending();
    expect(pending2.length).toBe(0);
  });

  it('should move to dead letter after max retries', async () => {
    const { WebhookDelivery } = await import('../src/webhook-delivery');
    const queueDir = '/tmp/test-webhook-delivery-' + Date.now();
    const delivery = new WebhookDelivery({ queueDir, maxRetries: 2, retryDelayMs: 0 });
    
    // All calls fail
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
    (delivery as any).fetch = mockFetch;
    
    await delivery.queue.enqueue({
      url: 'https://example.com/webhook',
      payload: { event: 'test' }
    });
    
    // Attempt 1
    await delivery.processQueue();
    // Attempt 2
    await delivery.processQueue();
    
    // Should be in dead letter queue
    const dead = await delivery.queue.getDeadLetter();
    expect(dead.length).toBe(1);
    expect(dead[0].retryCount).toBe(2);
  });
});
