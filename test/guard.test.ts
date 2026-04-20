import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PulsetelGuard, GuardOptions, GuardResult } from '../src/guard/index.js';

describe('PulsetelGuard', () => {
  let guard: PulsetelGuard;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('calculateDrift', () => {
    it('should detect no drift for identical states', () => {
      const options: GuardOptions = { command: 'echo', args: ['test'] };
      guard = new PulsetelGuard({}, options);

      const before = { status: 'success', duration: 100 };
      const after = { status: 'success', duration: 100 };

      const result = guard.calculateDrift(before, after, 20);

      expect(result.checks).toHaveLength(0);
      expect(result.exceededThreshold).toBe(false);
    });

    it('should detect drift when values change', () => {
      const options: GuardOptions = { command: 'echo', args: ['test'] };
      guard = new PulsetelGuard({}, options);

      const before = { duration: 100 };
      const after = { duration: 150 };

      const result = guard.calculateDrift(before, after, 20);

      expect(result.checks).toContain('duration');
      expect(result.maxChangePercent).toBe(50);
      expect(result.exceededThreshold).toBe(true);
    });

    it('should detect drift when status changes', () => {
      const options: GuardOptions = { command: 'echo', args: ['test'] };
      guard = new PulsetelGuard({}, options);

      const before = { status: 'success' };
      const after = { status: 'warning' };

      const result = guard.calculateDrift(before, after, 20);

      expect(result.checks).toContain('status');
      expect(result.maxChangePercent).toBe(100);
      expect(result.exceededThreshold).toBe(true);
    });

    it('should calculate percentage change from zero correctly', () => {
      const options: GuardOptions = { command: 'echo', args: ['test'] };
      guard = new PulsetelGuard({}, options);

      const before = { errors: 0 };
      const after = { errors: 5 };

      const result = guard.calculateDrift(before, after, 20);

      expect(result.checks).toContain('errors');
      expect(result.maxChangePercent).toBe(100);
    });

    it('should not exceed threshold when change is within limit', () => {
      const options: GuardOptions = { command: 'echo', args: ['test'] };
      guard = new PulsetelGuard({}, options);

      const before = { duration: 100 };
      const after = { duration: 110 };

      const result = guard.calculateDrift(before, after, 20);

      expect(result.exceededThreshold).toBe(false);
      expect(result.maxChangePercent).toBe(10);
    });

    it('should detect nested changes', () => {
      const options: GuardOptions = { command: 'echo', args: ['test'] };
      guard = new PulsetelGuard({}, options);

      const before = { results: { ci: { status: 'success' } } };
      const after = { results: { ci: { status: 'error' } } };

      const result = guard.calculateDrift(before, after, 20);

      expect(result.checks).toContain('results.ci.status');
      expect(result.maxChangePercent).toBe(100);
    });

    it('should handle added fields', () => {
      const options: GuardOptions = { command: 'echo', args: ['test'] };
      guard = new PulsetelGuard({}, options);

      const before = { existing: 1 };
      const after = { existing: 1, newField: 2 };

      const result = guard.calculateDrift(before, after, 20);

      expect(result.checks).toContain('newField');
      expect(result.maxChangePercent).toBe(100);
    });

    it('should handle removed fields', () => {
      const options: GuardOptions = { command: 'echo', args: ['test'] };
      guard = new PulsetelGuard({}, options);

      const before = { existing: 1, removed: 2 };
      const after = { existing: 1 };

      const result = guard.calculateDrift(before, after, 20);

      expect(result.checks).toContain('removed');
      expect(result.maxChangePercent).toBe(100);
    });

    it('should detect multiple changed checks', () => {
      const options: GuardOptions = { command: 'echo', args: ['test'] };
      guard = new PulsetelGuard({}, options);

      const before = { a: 100, b: 200, c: 300 };
      const after = { a: 150, b: 250, c: 350 };

      const result = guard.calculateDrift(before, after, 20);

      expect(result.checks).toHaveLength(3);
      expect(result.maxChangePercent).toBe(50); // 100→150 = 50%
    });

    it('should use custom threshold', () => {
      const options: GuardOptions = { command: 'echo', args: ['test'] };
      guard = new PulsetelGuard({}, options);

      const before = { duration: 100 };
      const after = { duration: 150 };

      const result = guard.calculateDrift(before, after, 100);

      expect(result.exceededThreshold).toBe(false);
      expect(result.maxChangePercent).toBe(50);
    });

    it('should handle negative values correctly', () => {
      const options: GuardOptions = { command: 'echo', args: ['test'] };
      guard = new PulsetelGuard({}, options);

      const before = { value: 100 };
      const after = { value: 50 };

      const result = guard.calculateDrift(before, after, 20);

      expect(result.maxChangePercent).toBe(50);
      expect(result.exceededThreshold).toBe(true);
    });
  });

  describe('flattenResults', () => {
    it('should flatten nested objects', () => {
      const options: GuardOptions = { command: 'echo', args: ['test'] };
      guard = new PulsetelGuard({}, options);

      const nested = {
        level1: {
          level2: {
            value: 42
          }
        }
      };

      const result = (guard as any).flattenResults(nested);

      expect(result['level1.level2.value']).toBe(42);
    });
  });
});