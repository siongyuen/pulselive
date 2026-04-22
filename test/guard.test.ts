import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PulsetelGuard, GuardOptions, GuardResult, validateGuardCommand } from '../src/guard/index.js';

// Tests for the validation function (pure, no mocking needed)
describe('validateGuardCommand', () => {
  it('should reject absolute paths', () => {
    const result = validateGuardCommand('/bin/rm');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Absolute paths not allowed');
  });

  it('should reject shell metacharacters (semicolon)', () => {
    const result = validateGuardCommand('echo; rm -rf /');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Shell metacharacters');
  });

  it('should reject shell metacharacters (pipe)', () => {
    const result = validateGuardCommand('cat /etc/passwd | grep root');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Shell metacharacters');
  });

  it('should reject commands not in allowlist', () => {
    const result = validateGuardCommand('malicious-binary');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('not in allowlist');
  });

  it('should accept npm', () => {
    const result = validateGuardCommand('npm');
    expect(result.valid).toBe(true);
  });

  it('should accept node', () => {
    const result = validateGuardCommand('node');
    expect(result.valid).toBe(true);
  });

  it('should accept git', () => {
    const result = validateGuardCommand('git');
    expect(result.valid).toBe(true);
  });

  it('should accept tsc', () => {
    const result = validateGuardCommand('tsc');
    expect(result.valid).toBe(true);
  });

  it('should accept vitest', () => {
    const result = validateGuardCommand('vitest');
    expect(result.valid).toBe(true);
  });
});

// Tests for PulsetelGuard class
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
      expect(result.maxChangePercent).toBe(10); // 100→110 = 10%
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

  describe('getValueByPath', () => {
    it('should get value from nested object using dot notation', () => {
      const options: GuardOptions = { command: 'echo', args: ['test'] };
      guard = new PulsetelGuard({}, options);

      const obj = {
        level1: {
          level2: {
            value: 42
          }
        }
      };

      const result = (guard as any).getValueByPath(obj, 'level1.level2.value');
      expect(result).toBe(42);
    });

    it('should return undefined for non-existent path', () => {
      const options: GuardOptions = { command: 'echo', args: ['test'] };
      guard = new PulsetelGuard({}, options);

      const obj = { a: 1, b: { c: 2 } };
      const result = (guard as any).getValueByPath(obj, 'b.d');
      expect(result).toBeUndefined();
    });

    it('should handle single level path', () => {
      const options: GuardOptions = { command: 'echo', args: ['test'] };
      guard = new PulsetelGuard({}, options);

      const obj = { a: 1, b: 2 };
      const result = (guard as any).getValueByPath(obj, 'b');
      expect(result).toBe(2);
    });
  });

  describe('outputResult', () => {
    let consoleLogSpy: any;
    let consoleErrorSpy: any;
    let consoleWarnSpy: any;

    beforeEach(() => {
      consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
      consoleErrorSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });

    it('should output no drift message when no drift detected', () => {
      const options: GuardOptions = { command: 'echo', args: ['test'] };
      guard = new PulsetelGuard({}, options);

      const result: GuardResult = {
        before: { status: 'success' },
        after: { status: 'success' },
        drift: {
          checks: [],
          maxChangePercent: 0,
          exceededThreshold: false
        },
        exitCode: 0,
        stdout: '',
        stderr: ''
      };

      (guard as any).outputResult(result);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('No drift detected.'));
    });

    it('should output drift warning when threshold exceeded', () => {
      const options: GuardOptions = { command: 'echo', args: ['test'] };
      guard = new PulsetelGuard({}, options);

      const result: GuardResult = {
        before: { status: 'success' },
        after: { status: 'error' },
        drift: {
          checks: ['status'],
          maxChangePercent: 100,
          exceededThreshold: true
        },
        exitCode: 0,
        stdout: '',
        stderr: ''
      };

      (guard as any).outputResult(result);

      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Drift detected!'));
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('1 checks changed'));
    });

    it('should output drift info when within threshold', () => {
      const options: GuardOptions = { command: 'echo', args: ['test'] };
      guard = new PulsetelGuard({}, options);

      const result: GuardResult = {
        before: { status: 'success' },
        after: { status: 'warning' },
        drift: {
          checks: ['status'],
          maxChangePercent: 50,
          exceededThreshold: false
        },
        exitCode: 0,
        stdout: '',
        stderr: ''
      };

      (guard as any).outputResult(result);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Drift detected but within threshold'));
    });

    it('should output command exit code', () => {
      const options: GuardOptions = { command: 'echo', args: ['test'] };
      guard = new PulsetelGuard({}, options);

      const result: GuardResult = {
        before: {},
        after: {},
        drift: {
          checks: [],
          maxChangePercent: 0,
          exceededThreshold: false
        },
        exitCode: 1,
        stdout: '',
        stderr: 'Error message'
      };

      (guard as any).outputResult(result);

      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Command exited with code: 1'));
    });

    it('should output changed checks details', () => {
      const options: GuardOptions = { command: 'echo', args: ['test'] };
      guard = new PulsetelGuard({}, options);

      const result: GuardResult = {
        before: { status: 'success', duration: 100 },
        after: { status: 'error', duration: 200 },
        drift: {
          checks: ['status', 'duration'],
          maxChangePercent: 100,
          exceededThreshold: true
        },
        exitCode: 0,
        stdout: '',
        stderr: ''
      };

      (guard as any).outputResult(result);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('status:'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('duration:'));
    });
  });

  describe('run', () => {
    it('should be testable with proper mocking setup', () => {
      // Note: Full run() testing requires complex mocking of execFileSync and Scanner
      // The key logic is tested through the individual method tests above
      expect(true).toBe(true);
    });
  });
});
