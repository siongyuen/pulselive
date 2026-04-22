import { WebhookQueue, WebhookQueueEntry, WebhookQueueOptions } from './webhook-queue.js';
import fetch from 'node-fetch';

export interface WebhookDeliveryOptions extends WebhookQueueOptions {
  intervalMs?: number;
}

/**
 * Webhook delivery worker that processes the queue and sends webhooks.
 * Runs at configurable intervals and handles retries.
 */
export class WebhookDelivery {
  public queue: WebhookQueue;
  private intervalMs: number;
  private timer: NodeJS.Timeout | null = null;
  private running: boolean = false;
  private fetch: typeof fetch;

  constructor(options: WebhookDeliveryOptions) {
    this.queue = new WebhookQueue({
      queueDir: options.queueDir,
      maxRetries: options.maxRetries,
      retryDelayMs: options.retryDelayMs
    });
    this.intervalMs = options.intervalMs || 30000; // Default: 30 seconds
    this.fetch = fetch;
  }

  /**
   * Start the delivery worker loop.
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.processLoop();
  }

  /**
   * Stop the delivery worker loop.
   */
  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /**
   * Process the queue once (deliver all pending/ready webhooks).
   * Can be called manually or by the loop.
   */
  async processQueue(): Promise<void> {
    const ready = await this.queue.getReadyForRetry();

    for (const entry of ready) {
      try {
        const response = await this.deliver(entry);
        if (response.ok) {
          await this.queue.markDelivered(entry.id);
        } else {
          await this.queue.incrementRetry(entry.id);
        }
      } catch (error) {
        // Network or other error - increment retry
        await this.queue.incrementRetry(entry.id);
      }
    }
  }

  /**
   * Deliver a single webhook entry.
   */
  private async deliver(entry: WebhookQueueEntry): Promise<{ ok: boolean; status: number }> {
    const response = await this.fetch(entry.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'pulsetel-webhook/1.0'
      },
      body: JSON.stringify(entry.payload)
    });

    return {
      ok: response.ok,
      status: response.status
    };
  }

  private async processLoop(): Promise<void> {
    if (!this.running) return;

    try {
      await this.processQueue();
    } catch (error) {
      // Silent fail - will retry on next iteration
    }

    this.timer = setTimeout(() => {
      this.processLoop();
    }, this.intervalMs);
  }
}
