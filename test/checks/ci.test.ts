import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CICheck } from '../../src/checks/ci';
import { GitHubDeps, defaultGitHubDeps } from '../../src/checks/github-deps';
import { PulseliveConfig } from '../../src/config';

describe('CICheck', () => {
  let config: PulseliveConfig;
  let mockDeps: GitHubDeps;

  beforeEach(() => {
    config = {};
    mockDeps = {
      fetch: vi.fn(),
    };
  });

  it('should return warning when no repo configured', async () => {
    const ciCheck = new CICheck(config, mockDeps);
    const result = await ciCheck.run();

    expect(result.type).toBe('ci');
    expect(result.status).toBe('warning');
    expect(result.message).toContain('No GitHub repository configured');
    expect(mockDeps.fetch).not.toHaveBeenCalled();
  });

  it('should return warning when no token provided', async () => {
    config.github = { repo: 'test-org/test-repo' };
    const ciCheck = new CICheck(config, mockDeps);

    const result = await ciCheck.run();

    expect(result.type).toBe('ci');
    expect(result.status).toBe('warning');
    expect(result.message).toContain('No GitHub token provided');
    expect(mockDeps.fetch).not.toHaveBeenCalled();
  });

  it('should handle API error', async () => {
    config.github = { repo: 'test-org/test-repo', token: 'test-token' };
    mockDeps.fetch.mockResolvedValue({
      ok: false,
      status: 404,
    });

    const ciCheck = new CICheck(config, mockDeps);
    const result = await ciCheck.run();

    expect(result.type).toBe('ci');
    expect(result.status).toBe('error');
    expect(result.message).toContain('GitHub API error');
  });

  it('should handle auth failure as warning', async () => {
    config.github = { repo: 'test-org/test-repo', token: 'bad-token' };
    mockDeps.fetch.mockResolvedValue({
      ok: false,
      status: 401,
    });

    const ciCheck = new CICheck(config, mockDeps);
    const result = await ciCheck.run();

    expect(result.type).toBe('ci');
    expect(result.status).toBe('warning');
    expect(result.message).toContain('GitHub auth failed');
  });

  it('should handle successful workflow run', async () => {
    config.github = { repo: 'test-org/test-repo', token: 'test-token' };
    mockDeps.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        workflow_runs: [{
          id: 123,
          name: 'CI',
          conclusion: 'success',
          updated_at: '2023-01-01T00:00:00Z',
        }],
      }),
    });

    const ciCheck = new CICheck(config, mockDeps);
    const result = await ciCheck.run();

    expect(result.type).toBe('ci');
    expect(result.status).toBe('success');
    expect(result.message).toContain('Latest run: CI (success)');
    expect(result.details.flakinessScore).toBe(0);
  });

  it('should handle failed workflow run', async () => {
    config.github = { repo: 'test-org/test-repo', token: 'test-token' };
    mockDeps.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        workflow_runs: [{
          id: 123,
          name: 'CI',
          conclusion: 'failure',
          updated_at: '2023-01-01T00:00:00Z',
        }],
      }),
    });

    const ciCheck = new CICheck(config, mockDeps);
    const result = await ciCheck.run();

    expect(result.type).toBe('ci');
    expect(result.status).toBe('error');
    expect(result.message).toContain('Latest run: CI (failure)');
  });

  it('should calculate flakiness and trend correctly', async () => {
    config.github = { repo: 'test-org/test-repo', token: 'test-token' };
    mockDeps.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        workflow_runs: [
          { id: 10, name: 'CI', conclusion: 'success', updated_at: '2023-01-10T00:00:00Z' },
          { id: 9, name: 'CI', conclusion: 'failure', updated_at: '2023-01-09T00:00:00Z' },
          { id: 8, name: 'CI', conclusion: 'success', updated_at: '2023-01-08T00:00:00Z' },
          { id: 7, name: 'CI', conclusion: 'failure', updated_at: '2023-01-07T00:00:00Z' },
          { id: 6, name: 'CI', conclusion: 'failure', updated_at: '2023-01-06T00:00:00Z' },
          { id: 5, name: 'CI', conclusion: 'success', updated_at: '2023-01-05T00:00:00Z' },
          { id: 4, name: 'CI', conclusion: 'success', updated_at: '2023-01-04T00:00:00Z' },
          { id: 3, name: 'CI', conclusion: 'success', updated_at: '2023-01-03T00:00:00Z' },
        ],
      }),
    });

    const ciCheck = new CICheck(config, mockDeps);
    const result = await ciCheck.run();

    expect(result.details.flakinessScore).toBe(38); // 3 failures / 8 runs = 37.5 → 38
    expect(result.details.trend).toBe('improving'); // last 3 fail rate 1/3 < prev 3 fail rate 2/3
  });

  it('should handle empty workflow runs', async () => {
    config.github = { repo: 'test-org/test-repo', token: 'test-token' };
    mockDeps.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ workflow_runs: [] }),
    });

    const ciCheck = new CICheck(config, mockDeps);
    const result = await ciCheck.run();

    expect(result.type).toBe('ci');
    expect(result.status).toBe('warning');
    expect(result.message).toContain('No workflow runs found');
  });

  it('should handle network failure gracefully', async () => {
    config.github = { repo: 'test-org/test-repo', token: 'test-token' };
    mockDeps.fetch.mockRejectedValue(new Error('ECONNREFUSED'));

    const ciCheck = new CICheck(config, mockDeps);
    const result = await ciCheck.run();

    expect(result.type).toBe('ci');
    expect(result.status).toBe('error');
    expect(result.message).toContain('CI check failed');
  });

  it('should use defaultGitHubDeps when no deps provided', () => {
    const ciCheck = new CICheck(config);
    expect(ciCheck).toBeInstanceOf(CICheck);
  });

  it('should pass correct headers to fetch', async () => {
    config.github = { repo: 'test-org/test-repo', token: 'my-token' };
    mockDeps.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ workflow_runs: [] }),
    });

    const ciCheck = new CICheck(config, mockDeps);
    await ciCheck.run();

    expect(mockDeps.fetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/test-org/test-repo/actions/runs?per_page=10',
      {
        headers: {
          Authorization: 'token my-token',
          Accept: 'application/vnd.github.v3+json',
        },
      },
    );
  });
});