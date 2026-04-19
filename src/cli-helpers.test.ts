import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fixDependencies, defaultCLIDeps, CLIDeps } from './cli-helpers';
import { FixResult } from './cli-helpers';

describe('fixDependencies with DI', () => {
  let mockDeps: CLIDeps;

  beforeEach(() => {
    mockDeps = {
      exit: vi.fn(),
      log: vi.fn(),
      error: vi.fn(),
      readFile: vi.fn(),
      writeFile: vi.fn(),
      existsSync: vi.fn(),
      mkdirSync: vi.fn(),
      execFile: vi.fn(),
      cwd: vi.fn().mockReturnValue('/project')
    };
  });

  it('should return failed result when no package.json exists', async () => {
    mockDeps.existsSync.mockReturnValue(false);
    
    const result = await fixDependencies('/project', false, false, mockDeps);
    
    expect(result.status).toBe('failed');
    expect(result.message).toBe('No package.json found in working directory');
    expect(result.success).toBe(false);
  });

  it('should return success when no vulnerabilities found', async () => {
    mockDeps.existsSync.mockReturnValue(true);
    mockDeps.execFile.mockReturnValue(JSON.stringify({
      vulnerabilities: {}
    }));
    
    const result = await fixDependencies('/project', false, false, mockDeps);
    
    expect(result.status).toBe('success');
    expect(result.message).toBe('No vulnerabilities found - nothing to fix');
    expect(result.success).toBe(true);
  });

  it('should return dry-run result when dryRun is true', async () => {
    mockDeps.existsSync.mockReturnValue(true);
    mockDeps.execFile.mockReturnValue(JSON.stringify({
      vulnerabilities: {
        'package1': {}
      }
    }));
    
    const result = await fixDependencies('/project', true, false, mockDeps);
    
    expect(result.status).toBe('success');
    expect(result.message).toContain('Would fix 1 vulnerabilities (dry run)');
    expect(result.dryRun).toBe(true);
  });

  it('should log confirmation messages when not skipping confirmation', async () => {
    mockDeps.existsSync.mockReturnValue(true);
    mockDeps.execFile.mockReturnValue(JSON.stringify({
      vulnerabilities: {
        'package1': {}
      }
    }));
    
    await fixDependencies('/project', false, false, mockDeps);
    
    expect(mockDeps.log).toHaveBeenCalledWith(expect.stringContaining('🔧 Ready to fix'));
    expect(mockDeps.log).toHaveBeenCalledWith(expect.stringContaining('Continue?'));
  });

  it('should not log confirmation messages when skipping confirmation', async () => {
    mockDeps.existsSync.mockReturnValue(true);
    mockDeps.execFile.mockReturnValue(JSON.stringify({
      vulnerabilities: {
        'package1': {}
      }
    }));
    
    await fixDependencies('/project', false, true, mockDeps);
    
    expect(mockDeps.log).not.toHaveBeenCalledWith(expect.stringContaining('Continue?'));
  });

  it('should handle npm audit fix success with all vulnerabilities fixed', async () => {
    mockDeps.existsSync.mockReturnValue(true);
    
    // First call to npm audit (before fix)
    mockDeps.execFile.mockImplementationOnce(() => {
      return JSON.stringify({
        vulnerabilities: {
          'package1': {},
          'package2': {}
        }
      });
    });

    // Second call to npm audit fix
    mockDeps.execFile.mockImplementationOnce(() => {
      return JSON.stringify({});
    });

    // Third call to npm audit (after fix)
    mockDeps.execFile.mockImplementationOnce(() => {
      return JSON.stringify({
        vulnerabilities: {}
      });
    });
    
    const result = await fixDependencies('/project', false, true, mockDeps);
    
    expect(result.status).toBe('success');
    expect(result.message).toContain('Successfully fixed all 2 vulnerabilities');
  });

  it('should handle npm audit fix partial success', async () => {
    mockDeps.existsSync.mockReturnValue(true);
    
    // First call to npm audit (before fix)
    mockDeps.execFile.mockImplementationOnce(() => {
      return JSON.stringify({
        vulnerabilities: {
          'package1': {},
          'package2': {}
        }
      });
    });

    // Second call to npm audit fix
    mockDeps.execFile.mockImplementationOnce(() => {
      return JSON.stringify({});
    });

    // Third call to npm audit (after fix)
    mockDeps.execFile.mockImplementationOnce(() => {
      return JSON.stringify({
        vulnerabilities: {
          'package1': {}
        }
      });
    });
    
    const result = await fixDependencies('/project', false, true, mockDeps);
    
    expect(result.status).toBe('partial');
    expect(result.message).toContain('Partially fixed: 1 vulnerabilities fixed, 1 remain');
  });

  it('should handle npm audit fix failure', async () => {
    mockDeps.existsSync.mockReturnValue(true);
    
    // First call to npm audit (before fix)
    mockDeps.execFile.mockImplementationOnce(() => {
      return JSON.stringify({
        vulnerabilities: {
          'package1': {}
        }
      });
    });

    // Second call to npm audit fix - throw error
    mockDeps.execFile.mockImplementationOnce(() => {
      throw new Error('npm audit fix failed');
    });
    
    const result = await fixDependencies('/project', false, true, mockDeps);
    
    expect(result.status).toBe('failed');
    expect(result.message).toContain('npm audit fix failed');
  });

  it('should handle general errors gracefully', async () => {
    mockDeps.existsSync.mockImplementation(() => {
      throw new Error('File system error');
    });
    
    const result = await fixDependencies('/project', false, true, mockDeps);
    
    expect(result.status).toBe('failed');
    expect(result.message).toContain('Dependency fix failed');
  });
});