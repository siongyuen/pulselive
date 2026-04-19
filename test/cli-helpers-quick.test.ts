import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  runQuickCheck,
  formatQuickOutput,
  handleQuickExitCodes
} from '../src/cli-helpers';
import { CheckResult } from '../src/scanner';
import { CLIDeps } from '../src/cli-helpers';

describe('cli-helpers quick functions', () => {
  let mockDeps: CLIDeps;
  let mockExit: any;
  let mockLog: any;

  beforeEach(() => {
    mockExit = vi.fn();
    mockLog = vi.fn();
    mockDeps = {
      exit: mockExit,
      log: mockLog,
      error: vi.fn(),
      readFile: vi.fn(),
      writeFile: vi.fn(),
      existsSync: vi.fn(),
      mkdirSync: vi.fn(),
      execFile: vi.fn(),
      cwd: vi.fn()
    };
  });

  // ── runQuickCheck ───

  describe('runQuickCheck', () => {
    it('should run quick checks in specified directory', async () => {
      mockDeps.cwd.mockReturnValue('/test/dir');
      mockDeps.existsSync.mockReturnValue(true);
      mockDeps.readFile.mockReturnValue('{}');

      const result = await runQuickCheck('/test/dir', { json: false }, mockDeps);
      
      expect(result).toHaveProperty('results');
      expect(result).toHaveProperty('duration');
      expect(result.duration).toBeGreaterThan(0);
    });

    it('should use current directory when no dir specified', async () => {
      mockDeps.cwd.mockReturnValue('/current/dir');
      mockDeps.existsSync.mockReturnValue(true);
      mockDeps.readFile.mockReturnValue('{}');

      const result = await runQuickCheck(undefined, { json: false }, mockDeps);
      
      expect(result).toHaveProperty('results');
      expect(result.duration).toBeGreaterThan(0);
    });

    it('should exit when repos option is specified', async () => {
      mockDeps.cwd.mockReturnValue('/test/dir');
      
      // This should trigger the exit path
      await runQuickCheck('/test/dir', { repos: 'repo1,repo2' }, mockDeps);
      
      expect(mockExit).toHaveBeenCalledWith(0);
    });
  });

  // ── formatQuickOutput ───

  describe('formatQuickOutput', () => {
    const mockResults: CheckResult[] = [
      {
        type: 'ci',
        status: 'success',
        message: 'CI is healthy',
        details: {},
        duration: 100
      },
      {
        type: 'git',
        status: 'warning',
        message: 'Uncommitted changes',
        details: {},
        duration: 50
      }
    ];

    it('should output JSON when json option is true', () => {
      formatQuickOutput(mockResults, 150, { json: true }, mockDeps);
      
      expect(mockLog).toHaveBeenCalled();
      const callArg = mockLog.mock.calls[0][0];
      expect(() => JSON.parse(callArg)).not.toThrow();
      const parsed = JSON.parse(callArg);
      expect(parsed.schema_version).toBe('1.0.0');
      expect(parsed.quick).toBe(true);
      expect(parsed.results).toHaveLength(2);
    });

    it('should output standard format when json option is false', () => {
      formatQuickOutput(mockResults, 150, { json: false }, mockDeps);
      
      expect(mockLog).toHaveBeenCalled();
      const calls = mockLog.mock.calls.map(call => call[0]);
      expect(calls.some(call => call.includes('✅'))).toBe(true);
      expect(calls.some(call => call.includes('⚠️'))).toBe(true);
      expect(calls.some(call => call.includes('Quick mode'))).toBe(true);
      expect(calls.some(call => call.includes('deps and coverage skipped'))).toBe(true);
    });

    it('should include duration in output', () => {
      formatQuickOutput(mockResults, 150, { json: false }, mockDeps);
      
      expect(mockLog).toHaveBeenCalled();
      const calls = mockLog.mock.calls.map(call => call[0]);
      expect(calls.some(call => call.includes('150ms'))).toBe(true);
    });
  });

  // ── handleQuickExitCodes ───

  describe('handleQuickExitCodes', () => {
    const mockResults: CheckResult[] = [
      {
        type: 'ci',
        status: 'success',
        message: 'CI is healthy',
        details: {},
        duration: 100
      }
    ];

    const mockResultsWithError: CheckResult[] = [
      {
        type: 'ci',
        status: 'error',
        message: 'CI failed',
        details: {},
        duration: 100
      }
    ];

    const mockResultsWithWarning: CheckResult[] = [
      {
        type: 'git',
        status: 'warning',
        message: 'Uncommitted changes',
        details: {},
        duration: 50
      }
    ];

    it('should exit with code 0 when all checks are healthy and exitCode option is true', () => {
      handleQuickExitCodes(mockResults, { exitCode: true }, mockDeps);
      expect(mockExit).toHaveBeenCalledWith(0);
    });

    it('should exit with code 1 when there are errors and exitCode option is true', () => {
      handleQuickExitCodes(mockResultsWithError, { exitCode: true }, mockDeps);
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('should exit with code 2 when there are only warnings and exitCode option is true', () => {
      handleQuickExitCodes(mockResultsWithWarning, { exitCode: true }, mockDeps);
      expect(mockExit).toHaveBeenCalledWith(2);
    });

    it('should not exit when exitCode option is false', () => {
      handleQuickExitCodes(mockResults, { exitCode: false }, mockDeps);
      expect(mockExit).not.toHaveBeenCalled();
    });
  });
});