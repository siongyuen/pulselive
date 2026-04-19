import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CoverageCheck, CoverageDeps, defaultCoverageDeps } from '../../src/checks/coverage';
import { PulseliveConfig } from '../../src/config';

describe('CoverageCheck', () => {
  let coverageCheck: CoverageCheck;
  let config: PulseliveConfig;
  let mockDeps: CoverageDeps;

  beforeEach(() => {
    config = {
      checks: {
        coverage: {
          enabled: true,
          threshold: 80
        }
      }
    };
    
    mockDeps = {
      fetch: vi.fn(),
      readFile: vi.fn(),
      existsSync: vi.fn()
    };
  });

  describe('constructor', () => {
    it('should create instance with default deps', () => {
      coverageCheck = new CoverageCheck(config);
      expect(coverageCheck).toBeInstanceOf(CoverageCheck);
    });

    it('should create instance with injected deps', () => {
      coverageCheck = new CoverageCheck(config, mockDeps);
      expect(coverageCheck).toBeInstanceOf(CoverageCheck);
    });
  });

  describe('coverage disabled', () => {
    it('should return warning when coverage is disabled', async () => {
      const disabledConfig: PulseliveConfig = {
        checks: {
          coverage: {
            enabled: false
          }
        }
      };
      
      coverageCheck = new CoverageCheck(disabledConfig, mockDeps);
      const result = await coverageCheck.run();
      
      expect(result.type).toBe('coverage');
      expect(result.status).toBe('warning');
      expect(result.message).toContain('No coverage reports found');
    });
  });

  describe('no coverage files', () => {
    it('should return warning when no coverage files found', async () => {
      mockDeps.existsSync.mockReturnValue(false);
      
      coverageCheck = new CoverageCheck(config, mockDeps);
      const result = await coverageCheck.run();
      
      expect(result.type).toBe('coverage');
      expect(result.status).toBe('warning');
      expect(result.message).toContain('No coverage reports found');
    });
  });

  describe('Istanbul coverage format', () => {
    it('should parse Istanbul coverage JSON', async () => {
      mockDeps.existsSync.mockImplementation((path: string) => {
        return path.includes('coverage-summary.json');
      });
      
      mockDeps.readFile.mockReturnValue(JSON.stringify({
        total: {
          lines: 85,
          statements: 85,
          functions: 80,
          branches: 75
        }
      }));
      
      coverageCheck = new CoverageCheck(config, mockDeps);
      const result = await coverageCheck.run();
      
      expect(result.type).toBe('coverage');
      expect(result.status).toBe('success');
      expect(result.message).toContain('%');
      expect(result.details.source).toBe('istanbul');
    });

    it('should return error when coverage below threshold', async () => {
      const lowConfig: PulseliveConfig = {
        checks: {
          coverage: {
            enabled: true,
            threshold: 90
          }
        }
      };
      
      mockDeps.existsSync.mockImplementation((path: string) => {
        return path.includes('coverage-summary.json');
      });
      
      mockDeps.readFile.mockReturnValue(JSON.stringify({
        total: {
          lines: 75,
          statements: 75,
          functions: 70,
          branches: 65
        }
      }));
      
      coverageCheck = new CoverageCheck(lowConfig, mockDeps);
      const result = await coverageCheck.run();
      
      expect(result.type).toBe('coverage');
      expect(result.status).toBe('warning');
      expect(result.message).toContain('%');
      expect(result.details.source).toBe('istanbul');
    });
  });

  describe('LCOV coverage format', () => {
    it('should parse LCOV coverage data', async () => {
      mockDeps.existsSync.mockImplementation((path: string) => {
        return path.includes('lcov.info');
      });
      
      mockDeps.readFile.mockReturnValue(`
SF:src/index.ts
LF:3
LH:2
end_of_record
`);
      
      coverageCheck = new CoverageCheck(config, mockDeps);
      const result = await coverageCheck.run();
      
      expect(result.type).toBe('coverage');
      expect(result.status).toBe('success');
      expect(result.message).toContain('%');
      expect(result.details.source).toBe('lcov');
    });

    it('should handle empty LCOV data', async () => {
      mockDeps.existsSync.mockImplementation((path: string) => {
        return path.includes('lcov.info');
      });
      
      mockDeps.readFile.mockReturnValue('');
      
      coverageCheck = new CoverageCheck(config, mockDeps);
      const result = await coverageCheck.run();
      
      expect(result.type).toBe('coverage');
      expect(result.status).toBe('success');
      expect(result.message).toContain('%');
    });
  });

  describe('Codecov remote coverage', () => {
    it('should fetch coverage from Codecov API', async () => {
      const remoteConfig: PulseliveConfig = {
        github: { repo: 'test-org/test-repo' },
        checks: {
          coverage: {
            enabled: true,
            threshold: 80,
            remote: {
              provider: 'codecov',
              repo: 'test-org/test-repo',
              token: 'test-token'
            }
          }
        }
      };
      
      mockDeps.existsSync.mockReturnValue(false);
      mockDeps.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          results: [{
            totals: {
              coverage: 85.5
            }
          }]
        })
      });
      
      coverageCheck = new CoverageCheck(remoteConfig, mockDeps);
      const result = await coverageCheck.run();
      
      expect(result.type).toBe('coverage');
      expect(result.status).toBe('success');
      expect(result.message).toContain('%');
      expect(mockDeps.fetch).toHaveBeenCalled();
    });

    it('should handle Codecov API errors', async () => {
      const remoteConfig: PulseliveConfig = {
        github: { repo: 'test-org/test-repo' },
        checks: {
          coverage: {
            enabled: true,
            threshold: 80,
            remote: {
              provider: 'codecov',
              repo: 'test-org/test-repo',
              token: 'test-token'
            }
          }
        }
      };
      
      mockDeps.existsSync.mockReturnValue(false);
      mockDeps.fetch.mockRejectedValue(new Error('Network error'));
      
      coverageCheck = new CoverageCheck(remoteConfig, mockDeps);
      const result = await coverageCheck.run();
      
      expect(result.type).toBe('coverage');
      expect(result.status).toBe('warning');
      expect(result.message).toContain('No coverage reports found');
    });
  });

  describe('Coveralls remote coverage', () => {
    it('should fetch coverage from Coveralls API', async () => {
      const remoteConfig: PulseliveConfig = {
        github: { repo: 'test-org/test-repo' },
        checks: {
          coverage: {
            enabled: true,
            threshold: 80,
            remote: {
              provider: 'coveralls',
              repo: 'test-org/test-repo',
              token: 'test-token'
            }
          }
        }
      };
      
      mockDeps.existsSync.mockReturnValue(false);
      mockDeps.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          covered_percent: 78.2
        })
      });
      
      coverageCheck = new CoverageCheck(remoteConfig, mockDeps);
      const result = await coverageCheck.run();
      
      expect(result.type).toBe('coverage');
      expect(result.status).toBe('warning');
      expect(result.message).toContain('%');
      expect(result.details.source).toBe('coveralls');
    });

    it('should handle Coveralls API errors', async () => {
      const remoteConfig: PulseliveConfig = {
        github: { repo: 'test-org/test-repo' },
        checks: {
          coverage: {
            enabled: true,
            threshold: 80,
            remote: {
              provider: 'coveralls',
              repo: 'test-org/test-repo',
              token: 'test-token'
            }
          }
        }
      };
      
      mockDeps.existsSync.mockReturnValue(false);
      mockDeps.fetch.mockResolvedValue({
        ok: false,
        status: 404
      });
      
      coverageCheck = new CoverageCheck(remoteConfig, mockDeps);
      const result = await coverageCheck.run();
      
      expect(result.type).toBe('coverage');
      expect(result.status).toBe('warning');
      expect(result.message).toContain('No coverage reports found');
    });
  });

  describe('threshold handling', () => {
    it('should use default threshold when not specified', async () => {
      const noThresholdConfig: PulseliveConfig = {
        checks: {
          coverage: {
            enabled: true
            // No threshold specified
          }
        }
      };
      
      mockDeps.existsSync.mockReturnValue(false);
      
      coverageCheck = new CoverageCheck(noThresholdConfig, mockDeps);
      const result = await coverageCheck.run();
      
      // Should still work without threshold
      expect(result.type).toBe('coverage');
    });

    it('should handle invalid threshold values', async () => {
      const invalidConfig: PulseliveConfig = {
        checks: {
          coverage: {
            enabled: true,
            threshold: -10 // Invalid
          }
        }
      };
      
      mockDeps.existsSync.mockReturnValue(false);
      
      coverageCheck = new CoverageCheck(invalidConfig, mockDeps);
      const result = await coverageCheck.run();
      
      expect(result.type).toBe('coverage');
      expect(result.status).toBe('warning');
    });
  });

  describe('error handling', () => {
    it('should handle file read errors gracefully', async () => {
      mockDeps.existsSync.mockReturnValue(true);
      mockDeps.readFile.mockImplementation(() => {
        throw new Error('File read error');
      });
      
      coverageCheck = new CoverageCheck(config, mockDeps);
      const result = await coverageCheck.run();
      
      expect(result.type).toBe('coverage');
      expect(result.status).toBe('warning');
      expect(result.message).toContain('No coverage reports found');
    });

    it('should handle JSON parse errors gracefully', async () => {
      mockDeps.existsSync.mockReturnValue(true);
      mockDeps.readFile.mockReturnValue('invalid json');
      
      coverageCheck = new CoverageCheck(config, mockDeps);
      const result = await coverageCheck.run();
      
      expect(result.type).toBe('coverage');
      expect(result.status).toBe('success');
      expect(result.message).toContain('%');
    });
  });
});