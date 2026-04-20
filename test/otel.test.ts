import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initOtel, withOtelSpan, exportResults, shutdownOtel, isOtelAvailable, _resetOtelDepsCache } from '../src/otel';

describe('OpenTelemetry Module', () => {
  beforeEach(() => {
    shutdownOtel();
    _resetOtelDepsCache();
  });

  afterEach(() => {
    shutdownOtel();
    vi.restoreAllMocks();
    _resetOtelDepsCache();
  });

  // ── initOtel ──

  describe('initOtel', () => {
    it('returns false when OTel is not enabled in config', () => {
      const result = initOtel({});
      expect(result).toBe(false);
    });

    it('returns false when otel.enabled is false', () => {
      const result = initOtel({ otel: { enabled: false } });
      expect(result).toBe(false);
    });

    it('returns false when otel.enabled is undefined', () => {
      const result = initOtel({ otel: {} });
      expect(result).toBe(false);
    });

    it('returns false when OTel dependencies are not installed', () => {
      // Reset cache and mock require to throw (simulates missing packages)
      _resetOtelDepsCache();
      vi.stubGlobal('_originalRequire', require);
      const mockRequire = vi.fn().mockImplementation(() => {
        throw new Error('Cannot find module');
      });
      vi.stubGlobal('require', mockRequire);

      const result = initOtel({ otel: { enabled: true } });
      expect(result).toBe(false);

      // Restore
      vi.stubGlobal('require', (global as any)._originalRequire || require);
    });
  });

  // ── withOtelSpan ──

  describe('withOtelSpan', () => {
    it('runs function normally when OTel not initialized', async () => {
      const fn = vi.fn().mockResolvedValue({ status: 'success', message: 'OK' });
      const result = await withOtelSpan('ci', fn);
      expect(fn).toHaveBeenCalled();
      expect(result).toEqual({ status: 'success', message: 'OK' });
    });

    it('returns function result when OTel not available', async () => {
      const fn = vi.fn().mockResolvedValue({ type: 'deps', status: 'error', message: 'Vulnerable' });
      const result = await withOtelSpan('deps', fn);
      expect(result).toEqual({ type: 'deps', status: 'error', message: 'Vulnerable' });
    });

    it('propagates errors from wrapped function', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Check failed'));
      await expect(withOtelSpan('ci', fn)).rejects.toThrow('Check failed');
    });
  });

  // ── exportResults ──

  describe('exportResults', () => {
    it('does nothing when OTel not initialized', () => {
      // Should not throw
      expect(() => exportResults([
        { type: 'ci', status: 'success', message: 'OK' }
      ] as any)).not.toThrow();
    });

    it('handles empty results array', () => {
      expect(() => exportResults([])).not.toThrow();
    });

    it('handles results with various statuses', () => {
      expect(() => exportResults([
        { type: 'ci', status: 'success', message: 'OK' },
        { type: 'deps', status: 'warning', message: 'Outdated' },
        { type: 'git', status: 'error', message: 'Uncommitted' }
      ] as any)).not.toThrow();
    });
  });

  // ── shutdownOtel ──

  describe('shutdownOtel', () => {
    it('does nothing when OTel not initialized', async () => {
      await expect(shutdownOtel()).resolves.toBeUndefined();
    });

    it('can be called multiple times safely', async () => {
      await shutdownOtel();
      await shutdownOtel();
      await shutdownOtel();
      // No errors
    });
  });

  // ── isOtelAvailable ──

  describe('isOtelAvailable', () => {
    it('returns false when OTel not initialized', () => {
      expect(isOtelAvailable()).toBe(false);
    });

    it('returns false after shutdown', async () => {
      initOtel({ otel: { enabled: true } });
      await shutdownOtel();
      expect(isOtelAvailable()).toBe(false);
    });
  });
});
