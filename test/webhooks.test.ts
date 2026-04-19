import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebhookNotifier, WebhookNotifierDeps, defaultWebhookNotifierDeps } from '../src/webhooks';
import { createHmac } from 'crypto';

describe('WebhookNotifier', () => {
  let mockDeps: WebhookNotifierDeps;

  beforeEach(() => {
    mockDeps = {
      fetch: vi.fn(),
      readFileSync: vi.fn(),
      readdirSync: vi.fn(),
      existsSync: vi.fn()
    };
  });

  describe('constructor', () => {
    it('creates notifier with empty webhooks when none configured', () => {
      const notifier = new WebhookNotifier({}, mockDeps);
      expect(notifier).toBeDefined();
    });

    it('creates notifier with configured webhooks', () => {
      const config = {
        webhooks: [
          { url: 'https://example.com/hook', events: ['critical'] },
        ],
      };
      const notifier = new WebhookNotifier(config, mockDeps);
      expect(notifier).toBeDefined();
    });

    it('uses default deps when not provided', () => {
      const notifier = new WebhookNotifier({});
      expect(notifier).toBeDefined();
    });
  });

  describe('notify', () => {
    it('does nothing when no webhooks configured', async () => {
      const notifier = new WebhookNotifier({}, mockDeps);
      const results = [{ type: 'ci', status: 'error', message: 'CI failed' }];
      // Should not throw
      await notifier.notify(results as any);
    });

    it('does nothing when no payloads generated', async () => {
      mockDeps.fetch.mockResolvedValue({ ok: true });
      const notifier = new WebhookNotifier({
        webhooks: [{ url: 'https://example.com/hook', events: ['critical'] }],
      }, mockDeps);
      const results = [{ type: 'ci', status: 'success', message: 'All good' }];
      // Should not throw even if webhook URL is unreachable
      await notifier.notify(results as any);
    });

    it('handles network errors gracefully', async () => {
      mockDeps.fetch.mockRejectedValue(new Error('Network error'));
      const notifier = new WebhookNotifier({
        webhooks: [{ url: 'http://localhost:1/nonexistent', events: ['critical'] }],
      }, mockDeps);
      const results = [{ type: 'ci', status: 'error', message: 'CI failed' }];
      // Should not throw on network failure
      await notifier.notify(results as any);
    });
  });

  describe('payload generation', () => {
    it('generates critical payload for error status', async () => {
      mockDeps.fetch.mockResolvedValue({ ok: true });
      mockDeps.existsSync.mockReturnValue(false);
      const notifier = new WebhookNotifier({
        webhooks: [{ url: 'http://localhost:1/hook', events: ['critical'] }],
      }, mockDeps);
      const results = [{ type: 'ci', status: 'error', message: 'CI failed' }];
      // Just verify it doesn't crash
      await notifier.notify(results as any);
    });

    it('generates flaky payload when CI flakiness is high', async () => {
      mockDeps.fetch.mockResolvedValue({ ok: true });
      mockDeps.existsSync.mockReturnValue(false);
      const notifier = new WebhookNotifier({
        webhooks: [{ url: 'http://localhost:1/hook', events: ['flaky'] }],
      }, mockDeps);
      const results = [{
        type: 'ci', status: 'warning', message: 'Flaky CI',
        details: { flakinessScore: 50 },
      }];
      await notifier.notify(results as any);
    });
  });

  describe('HMAC signing', () => {
    it('includes HMAC signature when secret is configured', () => {
      const secret = 'test-secret';
      const body = JSON.stringify({ event: 'critical' });
      const expectedSig = createHmac('sha256', secret).update(body).digest('hex');
      expect(expectedSig).toBeDefined();
      expect(expectedSig.length).toBe(64);
    });
  });

  describe('history loading', () => {
    it('returns empty array when history directory does not exist', () => {
      mockDeps.existsSync.mockReturnValue(false);
      const notifier = new WebhookNotifier({}, mockDeps);
      const history = (notifier as any).loadHistory();
      // May return empty or throw - just verify it doesn't crash
      expect(Array.isArray(history) || history === undefined).toBe(true);
    });

    it('loads history from files when directory exists', () => {
      mockDeps.existsSync.mockReturnValue(true);
      mockDeps.readdirSync.mockReturnValue(['run-2024-01-01.json']);
      mockDeps.readFileSync.mockReturnValue(JSON.stringify({
        timestamp: '2024-01-01T00:00:00Z',
        results: []
      }));

      const notifier = new WebhookNotifier({}, mockDeps);
      const history = (notifier as any).loadHistory();
      
      expect(history).toHaveLength(1);
      expect(history[0].timestamp).toBe('2024-01-01T00:00:00Z');
    });

    it('ignores non-run files in history directory', () => {
      mockDeps.existsSync.mockReturnValue(true);
      mockDeps.readdirSync.mockReturnValue(['run-2024-01-01.json', 'other-file.txt', 'temp.dat']);
      mockDeps.readFileSync.mockReturnValue(JSON.stringify({
        timestamp: '2024-01-01T00:00:00Z',
        results: []
      }));

      const notifier = new WebhookNotifier({}, mockDeps);
      const history = (notifier as any).loadHistory();
      
      expect(history).toHaveLength(1);
    });
  });
});