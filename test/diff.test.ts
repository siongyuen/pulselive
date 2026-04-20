import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PulsetelDiff } from '../src/diff/index.js';

describe('PulsetelDiff', () => {
  let diff: PulsetelDiff;

  beforeEach(() => {
    diff = new PulsetelDiff({}, '/tmp/pulsetel-test-diff');
  });

  describe('diffSnapshots', () => {
    it('should detect added fields', () => {
      const oldSnap = { a: 1, b: 2 };
      const newSnap = { a: 1, b: 2, c: 3 };

      const result = diff.diffSnapshots(oldSnap, newSnap);

      expect(result.added).toContain('c');
      expect(result.removed).toHaveLength(0);
      expect(result.changed).toHaveLength(0);
    });

    it('should detect removed fields', () => {
      const oldSnap = { a: 1, b: 2, c: 3 };
      const newSnap = { a: 1, b: 2 };

      const result = diff.diffSnapshots(oldSnap, newSnap);

      expect(result.removed).toContain('c');
      expect(result.added).toHaveLength(0);
      expect(result.changed).toHaveLength(0);
    });

    it('should detect changed fields', () => {
      const oldSnap = { status: 'success', duration: 100 };
      const newSnap = { status: 'warning', duration: 150 };

      const result = diff.diffSnapshots(oldSnap, newSnap);

      expect(result.changed).toHaveLength(2);
      expect(result.changed).toContainEqual({
        check: 'status',
        from: 'success',
        to: 'warning'
      });
      expect(result.changed).toContainEqual({
        check: 'duration',
        from: 100,
        to: 150
      });
    });

    it('should detect nested changes', () => {
      const oldSnap = { results: { ci: { status: 'success' } } };
      const newSnap = { results: { ci: { status: 'error' } } };

      const result = diff.diffSnapshots(oldSnap, newSnap);

      expect(result.changed).toHaveLength(1);
      expect(result.changed[0].check).toBe('results.ci.status');
      expect(result.changed[0].from).toBe('success');
      expect(result.changed[0].to).toBe('error');
    });

    it('should handle identical snapshots', () => {
      const oldSnap = { a: 1, b: { c: 2 } };
      const newSnap = { a: 1, b: { c: 2 } };

      const result = diff.diffSnapshots(oldSnap, newSnap);

      expect(result.added).toHaveLength(0);
      expect(result.removed).toHaveLength(0);
      expect(result.changed).toHaveLength(0);
    });

    it('should handle empty snapshots', () => {
      const oldSnap = {};
      const newSnap = { a: 1 };

      const result = diff.diffSnapshots(oldSnap, newSnap);

      expect(result.added).toContain('a');
      expect(result.removed).toHaveLength(0);
    });

    it('should handle complex mixed changes', () => {
      const oldSnap = {
        fieldA: 'value1',
        fieldB: 100,
        timestamp: '2026-01-01'
      };

      const newSnap = {
        fieldA: 'value2',
        fieldB: 100,
        newField: 'added'
      };

      const result = diff.diffSnapshots(oldSnap, newSnap);

      // fieldA changed, timestamp removed, newField added
      expect(result.changed).toContainEqual({
        check: 'fieldA',
        from: 'value1',
        to: 'value2'
      });
      expect(result.added).toContain('newField');
      expect(result.removed).toContain('timestamp');
    });
  });

  describe('flattenResults', () => {
    it('should flatten nested objects', () => {
      const nested = {
        level1: {
          level2: {
            value: 42
          }
        }
      };

      // Access private method via any cast
      const result = (diff as any).flattenResults(nested);

      expect(result['level1.level2.value']).toBe(42);
    });

    it('should handle arrays in objects', () => {
      const obj = {
        items: [1, 2, 3],
        simple: 'value'
      };

      const result = (diff as any).flattenResults(obj);

      expect(result['items']).toEqual([1, 2, 3]);
      expect(result['simple']).toBe('value');
    });
  });
});
