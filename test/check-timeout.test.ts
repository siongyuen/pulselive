import { describe, it, expect, vi } from 'vitest';
import { Scanner, CheckResult } from '../src/scanner';
import { PulseliveConfig } from '../src/config';

describe('Per-Check Timeouts', () => {
  const baseConfig: PulseliveConfig = {};

  it('should timeout slow checks and return error', async () => {
    const mockCheck = {
      type: 'slow',
      factory: () => ({
        run: vi.fn().mockImplementation(() => 
          new Promise(resolve => setTimeout(() => resolve({ 
            type: 'slow', status: 'success', message: 'ok' 
          }), 10000))
        )
      }),
      retryable: false,
      configKey: 'slow',
      timeoutMs: 100 // Very short timeout
    };

    const scanner = new Scanner(baseConfig, process.cwd(), { checks: [mockCheck] });
    const results = await scanner.runAllChecks();

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('error');
    expect(results[0].message.toLowerCase()).toContain('timed out');
  });

  it('should complete fast checks within timeout', async () => {
    const mockCheck = {
      type: 'fast',
      factory: () => ({
        run: vi.fn().mockResolvedValue({ 
          type: 'fast', status: 'success', message: 'ok' 
        })
      }),
      retryable: false,
      configKey: 'fast',
      timeoutMs: 5000
    };

    const scanner = new Scanner(baseConfig, process.cwd(), { checks: [mockCheck] });
    const results = await scanner.runAllChecks();

    expect(results[0].status).toBe('success');
  });

  it('should use default timeout when not specified', async () => {
    const mockCheck = {
      type: 'default',
      factory: () => ({
        run: vi.fn().mockResolvedValue({ 
          type: 'default', status: 'success', message: 'ok' 
        })
      }),
      retryable: false,
      configKey: 'default'
      // No timeoutMs specified
    };

    const scanner = new Scanner(baseConfig, process.cwd(), { checks: [mockCheck] });
    const results = await scanner.runAllChecks();

    expect(results[0].status).toBe('success');
  });
});
