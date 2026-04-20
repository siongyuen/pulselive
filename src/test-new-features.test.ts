import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PulseliveConfig } from './config';
import { PulsetelDiff } from './diff/index';
import { PulsetelGuard } from './guard/index';

describe('New features: diff and guard', () => {
  const mockConfig: PulseliveConfig = {
    checks: {
      ci: true,
      deps: true,
      git: true
    }
  };

  describe('PulsetelDiff', () => {
    it('should detect added checks', () => {
      const diff = new PulsetelDiff(mockConfig);
      
      const oldState = {
        checks: {
          ci: { passed: true },
          deps: { outdated: 0 }
        }
      };
      
      const newState = {
        checks: {
          ci: { passed: true },
          deps: { outdated: 2 },
          git: { ahead: 3 } // new check
        }
      };
      
      const result = diff.diffSnapshots(oldState, newState);
      
      expect(result.added).toEqual(['checks.git.ahead']);
      expect(result.removed).toEqual([]);
      expect(result.changed).toEqual([
        {
          check: 'checks.deps.outdated',
          from: 0,
          to: 2
        }
      ]);
    });

    it('should detect removed checks', () => {
      const diff = new PulsetelDiff(mockConfig);
      
      const oldState = {
        checks: {
          ci: { passed: true },
          deps: { outdated: 0 },
          git: { ahead: 3 }
        }
      };
      
      const newState = {
        checks: {
          ci: { passed: true },
          deps: { outdated: 0 }
          // git check removed
        }
      };
      
      const result = diff.diffSnapshots(oldState, newState);
      
      expect(result.added).toEqual([]);
      expect(result.removed).toEqual(['checks.git.ahead']);
      expect(result.changed).toEqual([]);
    });

    it('should detect no changes when states are identical', () => {
      const diff = new PulsetelDiff(mockConfig);
      
      const state = {
        checks: {
          ci: { passed: true },
          deps: { outdated: 5 }
        }
      };
      
      const result = diff.diffSnapshots(state, state);
      
      expect(result.added).toEqual([]);
      expect(result.removed).toEqual([]);
      expect(result.changed).toEqual([]);
    });
  });

  describe('PulsetelGuard', () => {
    it('should calculate drift correctly for numeric values', () => {
      const guard = new PulsetelGuard(mockConfig, {
        command: 'echo',
        args: ['test']
      });
      
      const before = {
        checks: {
          ci: { duration: 100 },
          deps: { outdated: 10 }
        }
      };
      
      const after = {
        checks: {
          ci: { duration: 150 }, // 50% increase
          deps: { outdated: 5 }  // 50% decrease
        }
      };
      
      const drift = guard.calculateDrift(before, after, 20); // 20% threshold
      
      expect(drift.checks).toEqual(['checks.ci.duration', 'checks.deps.outdated']);
      expect(drift.maxChangePercent).toBeCloseTo(50);
      expect(drift.exceededThreshold).toBe(true);
    });

    it('should detect no drift when changes are within threshold', () => {
      const guard = new PulsetelGuard(mockConfig, {
        command: 'echo',
        args: ['test']
      });
      
      const before = {
        checks: {
          ci: { duration: 100 },
          deps: { outdated: 10 }
        }
      };
      
      const after = {
        checks: {
          ci: { duration: 110 }, // 10% increase
          deps: { outdated: 11 } // 10% increase
        }
      };
      
      const drift = guard.calculateDrift(before, after, 20); // 20% threshold
      
      expect(drift.checks).toEqual(['checks.ci.duration', 'checks.deps.outdated']);
      expect(drift.maxChangePercent).toBeCloseTo(10);
      expect(drift.exceededThreshold).toBe(false);
    });

    it('should handle non-numeric changes', () => {
      const guard = new PulsetelGuard(mockConfig, {
        command: 'echo',
        args: ['test']
      });
      
      const before = {
        checks: {
          ci: { status: 'passed' },
          deps: { manager: 'npm' }
        }
      };
      
      const after = {
        checks: {
          ci: { status: 'failed' }, // changed
          deps: { manager: 'yarn' } // changed
        }
      };
      
      const drift = guard.calculateDrift(before, after, 20);
      
      // Non-numeric changes count as 100% change
      expect(drift.checks).toEqual(['checks.ci.status', 'checks.deps.manager']);
      expect(drift.maxChangePercent).toBe(100);
      expect(drift.exceededThreshold).toBe(true);
    });
  });
});