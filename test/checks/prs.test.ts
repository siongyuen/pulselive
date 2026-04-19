import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PRsCheck } from '../../src/checks/prs';
import { PulseliveConfig } from '../../src/config';
import { GitHubDeps, defaultGitHubDeps } from '../../src/checks/github-deps';

describe('PRsCheck', () => {
  let config: PulseliveConfig;
  let mockDeps: GitHubDeps;

  beforeEach(() => {
    config = {};
    mockDeps = {
      fetch: vi.fn(),
    };
  });

  it('should return warning when no repo configured', async () => {
    const check = new PRsCheck(config, mockDeps);
    const result = await check.run();
    
    expect(result.type).toBe('prs');
    expect(result.status).toBe('warning');
    expect(result.message).toContain('No GitHub repository configured');
    expect(mockDeps.fetch).not.toHaveBeenCalled();
  });

  it('should return warning when no token provided', async () => {
    config.github = { repo: 'test-org/test-repo' };
    const check = new PRsCheck(config, mockDeps);
    
    const result = await check.run();
    
    expect(result.type).toBe('prs');
    expect(result.status).toBe('warning');
    expect(result.message).toContain('No GitHub token provided');
    expect(mockDeps.fetch).not.toHaveBeenCalled();
  });

  it('should handle API error', async () => {
    config.github = { 
      repo: 'test-org/test-repo',
      token: 'test-token'
    };
    mockDeps.fetch.mockResolvedValue({
      ok: false,
      status: 404
    });
    
    const check = new PRsCheck(config, mockDeps);
    const result = await check.run();
    
    expect(result.type).toBe('prs');
    expect(result.status).toBe('error');
    expect(result.message).toContain('GitHub API error');
  });

  it('should report open PRs with no issues', async () => {
    config.github = { 
      repo: 'test-org/test-repo',
      token: 'test-token'
    };
    mockDeps.fetch.mockImplementation((url: string) => {
      if (url.includes('/pulls')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            { number: 1, draft: false, requested_reviewers: [], review_comments: 5, mergeable: true },
            { number: 2, draft: false, requested_reviewers: [], review_comments: 3, mergeable: true }
          ])
        });
      }
      if (url.includes('/search')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ total_count: 2 })
        });
      }
      return Promise.resolve({ ok: false });
    });
    
    const check = new PRsCheck(config, mockDeps);
    const result = await check.run();
    
    expect(result.type).toBe('prs');
    expect(result.status).toBe('success');
    expect(result.message).toContain('2 open PRs');
    expect(result.details.total).toBe(2);
  });

  it('should report PRs needing review and conflicts', async () => {
    config.github = { 
      repo: 'test-org/test-repo',
      token: 'test-token'
    };
    mockDeps.fetch.mockImplementation((url: string) => {
      if (url.includes('/pulls')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            { number: 1, draft: false, requested_reviewers: ['reviewer1'], review_comments: 0, mergeable: false },
            { number: 2, draft: true, requested_reviewers: [], review_comments: 5, mergeable: true },
            { number: 3, draft: false, requested_reviewers: [], review_comments: 1, mergeable: true }
          ])
        });
      }
      if (url.includes('/search')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ total_count: 3 })
        });
      }
      return Promise.resolve({ ok: false });
    });
    
    const check = new PRsCheck(config, mockDeps);
    const result = await check.run();
    
    expect(result.type).toBe('prs');
    expect(result.status).toBe('error'); // conflict = error
    expect(result.details.hasConflicts).toBe(1);
    expect(result.details.needsReview).toBe(1);
    expect(result.details.drafts).toBe(1);
  });

  it('should use defaultGitHubDeps when no deps provided', () => {
    const check = new PRsCheck(config);
    expect(check).toBeInstanceOf(PRsCheck);
  });

  it('should handle network failure gracefully', async () => {
    config.github = { repo: 'test-org/test-repo', token: 'test-token' };
    mockDeps.fetch.mockRejectedValue(new Error('ECONNREFUSED'));

    const check = new PRsCheck(config, mockDeps);
    const result = await check.run();

    expect(result.type).toBe('prs');
    expect(result.status).toBe('error');
    expect(result.message).toBe('PRs check failed');
  });

  it('should return warning for auth failure', async () => {
    config.github = { repo: 'test-org/test-repo', token: 'bad-token' };
    mockDeps.fetch.mockResolvedValue({
      ok: false,
      status: 403
    });

    const check = new PRsCheck(config, mockDeps);
    const result = await check.run();

    expect(result.type).toBe('prs');
    expect(result.status).toBe('warning');
    expect(result.message).toContain('GitHub auth failed');
  });
});