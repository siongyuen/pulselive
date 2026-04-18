import { describe, it, expect, vi } from 'vitest';
import { Scanner } from '../src/scanner';

// Use vi.hoisted for proper hoisting in vitest 4
const mockRun = (type: string, status: 'success' | 'warning' | 'error', message: string) =>
  vi.fn().mockResolvedValue({ type, status, message });

vi.mock('../src/checks/ci', () => {
  return {
    CICheck: vi.fn().mockImplementation(function() {
      return { run: mockRun('ci', 'warning', 'No GitHub token') };
    }),
  };
});
vi.mock('../src/checks/deploy', () => ({
  DeployCheck: vi.fn().mockImplementation(function() {
    return { run: mockRun('deploy', 'warning', 'No GitHub token') };
  }),
}));
vi.mock('../src/checks/health', () => ({
  HealthCheck: vi.fn().mockImplementation(function() {
    return { run: mockRun('health', 'warning', 'No endpoints') };
  }),
}));
vi.mock('../src/checks/git', () => ({
  GitCheck: vi.fn().mockImplementation(function() {
    return { run: mockRun('git', 'success', 'Git ok') };
  }),
}));
vi.mock('../src/checks/issues', () => ({
  IssuesCheck: vi.fn().mockImplementation(function() {
    return { run: mockRun('issues', 'warning', 'No GitHub token') };
  }),
}));
vi.mock('../src/checks/prs', () => ({
  PRsCheck: vi.fn().mockImplementation(function() {
    return { run: mockRun('prs', 'warning', 'No GitHub token') };
  }),
}));
vi.mock('../src/checks/coverage', () => ({
  CoverageCheck: vi.fn().mockImplementation(function() {
    return { run: mockRun('coverage', 'warning', 'No coverage') };
  }),
}));
vi.mock('../src/checks/deps', () => ({
  DepsCheck: vi.fn().mockImplementation(function() {
    return { run: mockRun('deps', 'success', 'Deps ok') };
  }),
}));
vi.mock('../src/webhooks', () => ({
  WebhookNotifier: vi.fn().mockImplementation(function() {
    return { notify: vi.fn().mockResolvedValue(undefined) };
  }),
}));

describe('Scanner', () => {
  it('runs all enabled checks and returns results with duration', async () => {
    const scanner = new Scanner({});
    const results = await scanner.runAllChecks();
    expect(results.length).toBeGreaterThan(0);
    results.forEach(result => {
      expect(['success', 'warning', 'error']).toContain(result.status);
      expect(typeof result.duration).toBe('number');
    });
  });

  it('skips disabled checks', async () => {
    const scanner = new Scanner({ checks: { ci: false, deploy: false } });
    const results = await scanner.runAllChecks();
    expect(results.filter(r => r.type === 'ci')).toHaveLength(0);
    expect(results.filter(r => r.type === 'deploy')).toHaveLength(0);
  });

  it('runSingleCheck returns a result for valid type', async () => {
    const scanner = new Scanner({});
    const result = await scanner.runSingleCheck('git');
    expect(result.type).toBe('git');
    expect(result.status).toBe('success');
  });

  it('runSingleCheck returns error for invalid type', async () => {
    const scanner = new Scanner({});
    const result = await scanner.runSingleCheck('nonexistent');
    expect(result.status).toBe('error');
    expect(result.message).toContain('Unknown check type');
  });

  it('runSingleCheck returns warning when check is disabled', async () => {
    const scanner = new Scanner({ checks: { ci: false } });
    const result = await scanner.runSingleCheck('ci');
    expect(result.status).toBe('warning');
    expect(result.message).toContain('disabled');
  });
});