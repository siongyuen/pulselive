import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IssuesCheck } from '../../src/checks/issues';
import { GitHubDeps, defaultGitHubDeps } from '../../src/checks/github-deps';

describe('IssuesCheck', () => {
  let mockConfig: any;
  let mockDeps: GitHubDeps;

  beforeEach(() => {
    mockConfig = {
      github: {
        repo: 'test-org/test-repo',
        token: 'test-token'
      }
    };
    mockDeps = {
      fetch: vi.fn(),
    };
  });

  it('should return warning when no repository configured', async () => {
    const config = { github: {} };
    const check = new IssuesCheck(config, mockDeps);
    
    const result = await check.run();
    
    expect(result.type).toBe('issues');
    expect(result.status).toBe('warning');
    expect(result.message).toBe('No GitHub repository configured');
    expect(mockDeps.fetch).not.toHaveBeenCalled();
  });

  it('should return warning when no token provided', async () => {
    const config = { github: { repo: 'test-org/test-repo' } };
    const check = new IssuesCheck(config, mockDeps);
    
    const result = await check.run();
    
    expect(result.type).toBe('issues');
    expect(result.status).toBe('warning');
    expect(result.message).toBe('No GitHub token provided, skipping issues check');
    expect(mockDeps.fetch).not.toHaveBeenCalled();
  });

  it('should return error when GitHub API returns non-200 status', async () => {
    mockDeps.fetch.mockResolvedValue({
      ok: false,
      status: 500
    });
    
    const check = new IssuesCheck(mockConfig, mockDeps);
    const result = await check.run();
    
    expect(result.type).toBe('issues');
    expect(result.status).toBe('error');
    expect(result.message).toBe('GitHub API error: 500');
  });

  it('should return warning when GitHub API returns auth failure', async () => {
    mockDeps.fetch.mockResolvedValue({
      ok: false,
      status: 401
    });
    
    const check = new IssuesCheck(mockConfig, mockDeps);
    const result = await check.run();
    
    expect(result.type).toBe('issues');
    expect(result.status).toBe('warning');
    expect(result.message).toBe('GitHub auth failed. Check your token.');
  });

  it('should return success when no issues found', async () => {
    mockDeps.fetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([])
    });
    
    const check = new IssuesCheck(mockConfig, mockDeps);
    const result = await check.run();
    
    expect(result.type).toBe('issues');
    expect(result.status).toBe('success');
    expect(result.message).toBe('0 open issues (0 critical, 0 bugs)');
  });

  it('should return warning when bug issues found', async () => {
    const mockIssues = [
      { number: 1, title: 'Bug fix', labels: [{ name: 'bug' }] },
      { number: 2, title: 'Feature request', labels: [] }
    ];
    
    mockDeps.fetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(mockIssues)
    });
    
    const check = new IssuesCheck(mockConfig, mockDeps);
    const result = await check.run();
    
    expect(result.type).toBe('issues');
    expect(result.status).toBe('warning');
    expect(result.message).toBe('2 open issues (0 critical, 1 bugs)');
  });

  it('should return error when critical issues found', async () => {
    const mockIssues = [
      { number: 1, title: 'Critical bug', labels: [{ name: 'critical' }] },
      { number: 2, title: 'Bug fix', labels: [{ name: 'bug' }] }
    ];
    
    mockDeps.fetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(mockIssues)
    });
    
    const check = new IssuesCheck(mockConfig, mockDeps);
    const result = await check.run();
    
    expect(result.type).toBe('issues');
    expect(result.status).toBe('error');
    expect(result.message).toBe('2 open issues (1 critical, 1 bugs)');
  });

  it('should use search API for total count when available', async () => {
    const mockIssues = [
      { number: 1, title: 'Issue 1', labels: [] }
    ];
    
    const mockSearchResponse = {
      total_count: 15
    };
    
    mockDeps.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockIssues)
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockSearchResponse)
      });
    
    const check = new IssuesCheck(mockConfig, mockDeps);
    const result = await check.run();
    
    expect(result.message).toBe('15 open issues (0 critical, 0 bugs)');
    expect(result.details.total).toBe(15);
  });

  it('should fall back to page count when search API fails', async () => {
    const mockIssues = [
      { number: 1, title: 'Issue 1', labels: [] },
      { number: 2, title: 'Issue 2', labels: [] }
    ];
    
    mockDeps.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockIssues)
      })
      .mockRejectedValueOnce(new Error('Search API failed'));
    
    const check = new IssuesCheck(mockConfig, mockDeps);
    const result = await check.run();
    
    expect(result.message).toBe('2 open issues (0 critical, 0 bugs)');
    expect(result.details.total).toBe(2);
  });

  it('should handle issues with multiple labels', async () => {
    const mockIssues = [
      { 
        number: 1, 
        title: 'Critical bug', 
        labels: [{ name: 'critical' }, { name: 'bug' }, { name: 'security' }]
      }
    ];
    
    mockDeps.fetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(mockIssues)
    });
    
    const check = new IssuesCheck(mockConfig, mockDeps);
    const result = await check.run();
    
    expect(result.details.critical).toBe(1);
    expect(result.details.bugs).toBe(1);
  });

  it('should return error when fetch throws an exception', async () => {
    mockDeps.fetch.mockRejectedValue(new Error('Network error'));
    
    const check = new IssuesCheck(mockConfig, mockDeps);
    const result = await check.run();
    
    expect(result.type).toBe('issues');
    expect(result.status).toBe('error');
    expect(result.message).toBe('Issues check failed');
  });

  it('should use correct GitHub API URLs', async () => {
    mockDeps.fetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([])
    });
    
    const check = new IssuesCheck(mockConfig, mockDeps);
    await check.run();
    
    expect(mockDeps.fetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/test-org/test-repo/issues?state=open&per_page=100',
      {
        headers: {
          Authorization: 'token test-token',
          Accept: 'application/vnd.github.v3+json'
        }
      }
    );

    expect(mockDeps.fetch).toHaveBeenCalledWith(
      'https://api.github.com/search/issues?q=repo:test-org/test-repo+is:issue+is:open',
      {
        headers: {
          Authorization: 'token test-token',
          Accept: 'application/vnd.github.v3+json'
        }
      }
    );
  });

  it('should use defaultGitHubDeps when no deps provided', () => {
    const check = new IssuesCheck(mockConfig);
    expect(check).toBeInstanceOf(IssuesCheck);
  });
});