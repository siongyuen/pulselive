import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { atomicWriteJsonSync, safeReadJsonSync } from './atomic-io';

export interface WebhookQueueEntry {
  id: string;
  url: string;
  payload: any;
  retryCount: number;
  createdAt: string;
  lastAttempt?: string;
  status: 'pending' | 'delivered' | 'failed';
}

export interface WebhookQueueOptions {
  queueDir: string;
  maxRetries?: number;
  retryDelayMs?: number;
}

/**
 * Persistent webhook queue with disk-backed storage.
 * Survives process restarts and retries failed deliveries.
 */
export class WebhookQueue {
  private queueDir: string;
  private pendingDir: string;
  private deliveredDir: string;
  private deadLetterDir: string;
  private maxRetries: number;
  private retryDelayMs: number;

  constructor(options: WebhookQueueOptions) {
    this.queueDir = options.queueDir;
    this.pendingDir = join(this.queueDir, 'pending');
    this.deliveredDir = join(this.queueDir, 'delivered');
    this.deadLetterDir = join(this.queueDir, 'dead-letter');
    this.maxRetries = options.maxRetries ?? 3;
    this.retryDelayMs = options.retryDelayMs ?? 5000;

    // Ensure directories exist
    [this.pendingDir, this.deliveredDir, this.deadLetterDir].forEach(dir => {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    });
  }

  /**
   * Add a webhook payload to the queue.
   */
  async enqueue(entry: Omit<WebhookQueueEntry, 'id' | 'retryCount' | 'createdAt' | 'status'>): Promise<WebhookQueueEntry> {
    const id = randomBytes(16).toString('hex');
    const queueEntry: WebhookQueueEntry = {
      ...entry,
      id,
      retryCount: 0,
      createdAt: new Date().toISOString(),
      status: 'pending'
    };

    const filePath = join(this.pendingDir, `${id}.json`);
    atomicWriteJsonSync(filePath, queueEntry);

    return queueEntry;
  }

  /**
   * Get all pending (undelivered) entries.
   */
  async getPending(): Promise<WebhookQueueEntry[]> {
    return this.readEntries(this.pendingDir);
  }

  /**
   * Get all dead letter entries (max retries exceeded).
   */
  async getDeadLetter(): Promise<WebhookQueueEntry[]> {
    return this.readEntries(this.deadLetterDir);
  }

  /**
   * Mark an entry as delivered and move to delivered directory.
   */
  async markDelivered(id: string): Promise<void> {
    const pendingPath = join(this.pendingDir, `${id}.json`);
    const deliveredPath = join(this.deliveredDir, `${id}.json`);

    if (!existsSync(pendingPath)) {
      return;
    }

    const entry = safeReadJsonSync(pendingPath) as WebhookQueueEntry;
    if (entry) {
      entry.status = 'delivered';
      atomicWriteJsonSync(deliveredPath, entry);
      try {
        unlinkSync(pendingPath);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Increment retry count for an entry.
   * If max retries exceeded, move to dead letter queue.
   */
  async incrementRetry(id: string): Promise<void> {
    const pendingPath = join(this.pendingDir, `${id}.json`);

    if (!existsSync(pendingPath)) {
      return;
    }

    const entry = safeReadJsonSync(pendingPath) as WebhookQueueEntry;
    if (!entry) return;

    entry.retryCount++;
    entry.lastAttempt = new Date().toISOString();

    if (entry.retryCount >= this.maxRetries) {
      // Move to dead letter
      entry.status = 'failed';
      const deadPath = join(this.deadLetterDir, `${id}.json`);
      atomicWriteJsonSync(deadPath, entry);
      try {
        unlinkSync(pendingPath);
      } catch {
        // Ignore cleanup errors
      }
    } else {
      // Update in place
      atomicWriteJsonSync(pendingPath, entry);
    }
  }

  /**
   * Clean up old delivered entries older than specified days.
   */
  async cleanup(olderThanDays: number = 7): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);

    let cleaned = 0;

    // Clean delivered
    for (const file of this.listJsonFiles(this.deliveredDir)) {
      const filePath = join(this.deliveredDir, file);
      const entry = safeReadJsonSync(filePath) as WebhookQueueEntry | null;
      if (entry && entry.createdAt) {
        const created = new Date(entry.createdAt);
        // When olderThanDays is 0, delete all delivered items (created <= cutoff)
        const shouldDelete = olderThanDays === 0 ? created <= cutoff : created < cutoff;
        if (shouldDelete) {
          try {
            unlinkSync(filePath);
            cleaned++;
          } catch {
            // Ignore cleanup errors
          }
        }
      }
    }

    return cleaned;
  }

  /**
   * Get entries that are ready for retry (exceeded retry delay).
   */
  async getReadyForRetry(): Promise<WebhookQueueEntry[]> {
    const pending = await this.getPending();
    const now = Date.now();

    return pending.filter(entry => {
      if (entry.retryCount === 0) return true;
      if (!entry.lastAttempt) return true;
      // If retryDelayMs is 0, always retry immediately
      if (this.retryDelayMs === 0) return true;
      const lastAttempt = new Date(entry.lastAttempt).getTime();
      return now - lastAttempt >= this.retryDelayMs;
    });
  }

  private readEntries(dir: string): WebhookQueueEntry[] {
    if (!existsSync(dir)) return [];

    const entries: WebhookQueueEntry[] = [];
    for (const file of this.listJsonFiles(dir)) {
      const entry = safeReadJsonSync(join(dir, file)) as WebhookQueueEntry | null;
      if (entry) {
        entries.push(entry);
      }
    }

    // Sort by creation time (oldest first)
    return entries.sort((a, b) => 
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }

  private listJsonFiles(dir: string): string[] {
    if (!existsSync(dir)) return [];
    return readdirSync(dir).filter(f => f.endsWith('.json'));
  }
}
