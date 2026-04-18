import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IssuesCheck } from '../../src/checks/issues';
import fetch from 'node-fetch';

vi.mock('node-fetch');

describe('IssuesCheck', () => {
  let issuesCheck: IssuesCheck;
  let mockConfig: any;

  beforeEach(() => {
    mockConfig = {
      github: {
        repo: 'test-org/test-repo',
        token: 'test-token'
      }
    };
    issuesCheck = new IssuesCheck(mockConfig);
  });

  it('should return warning when no repository configured', async () => {
    const config = { github: {} };
    const check = new IssuesCheck(config);
    
    const result = await check.run();
    
    expect(result.type).toBe('issues');
    expect(result.status).toBe('warning');
    expect(result.message).toBe('No GitHub repository configured');
  });

  it('should return warning when no token provided', async () => {
    const config = { github: { repo: 'test-org/test-repo' } };
    const check = new IssuesCheck(config);
    
    const result = await check.run();
    
    expect(result.type).toBe('issues');
    expect(result.status).toBe('warning');
    expect(result.message).toBe('No GitHub token provided, skipping issues check');
  });

  it('should return error when GitHub API returns non-200 status', async () => {
    (fetch as any).mockResolvedValue({
      ok: false,
      status: 500
    });
    
    const result = await issuesCheck.run();
    
    expect(result.type).toBe('issues');
    expect(result.status).toBe('error');
    expect(result.message).toBe('GitHub API error: 500');
  });

  it('should return warning when GitHub API returns auth failure', async () => {
    (fetch as any).mockResolvedValue({
      ok: false,
      status: 401
    });
    
    const result = await issuesCheck.run();
    
    expect(result.type).toBe('issues');
    expect(result.status).toBe('warning');
    expect(result.message).toBe('GitHub auth failed. Check your token.');
  });

  it('should return success when no issues found', async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([])
    });
    
    const result = await issuesCheck.run();
    
    expect(result.type).toBe('issues');
    expect(result.status).toBe('success');
    expect(result.message).toBe('0 open issues (0 critical, 0 bugs)');
    expect(result.details).toEqual({ total: 0, critical: 0, bugs: 0 });
  });

  it('should return success when only non-critical issues found', async () => {
    const mockIssues = [
      { number: 1, title: 'Feature request', labels: [] },
      { number: 2, title: 'Documentation', labels: [] }
    ];
    
    (fetch as any).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(mockIssues)
    });
    
    const result = await issuesCheck.run();
    
    expect(result.type).toBe('issues');
    expect(result.status).toBe('success');
    expect(result.message).toBe('2 open issues (0 critical, 0 bugs)');
    expect(result.details).toEqual({ total: 2, critical: 0, bugs: 0 });
  });

  it('should return warning when bug issues found', async () => {
    const mockIssues = [
      { number: 1, title: 'Bug fix', labels: [{ name: 'bug' }] },
      { number: 2, title: 'Feature request', labels: [] }
    ];
    
    (fetch as any).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(mockIssues)
    });
    
    const result = await issuesCheck.run();
    
    expect(result.type).toBe('issues');
    expect(result.status).toBe('warning');
    expect(result.message).toBe('2 open issues (0 critical, 1 bugs)');
    expect(result.details).toEqual({ total: 2, critical: 0, bugs: 1 });
  });

  it('should return error when critical issues found', async () => {
    const mockIssues = [
      { number: 1, title: 'Critical bug', labels: [{ name: 'critical' }] },
      { number: 2, title: 'Bug fix', labels: [{ name: 'bug' }] }
    ];
    
    (fetch as any).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(mockIssues)
    });
    
    const result = await issuesCheck.run();
    
    expect(result.type).toBe('issues');
    expect(result.status).toBe('error');
    expect(result.message).toBe('2 open issues (1 critical, 1 bugs)');
    expect(result.details).toEqual({ total: 2, critical: 1, bugs: 1 });
  });

  it('should use search API for total count when available', async () => {
    const mockIssues = [
      { number: 1, title: 'Issue 1', labels: [] }
    ];
    
    const mockSearchResponse = {
      total_count: 15
    };
    
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue(mockIssues)
    }).mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue(mockSearchResponse)
    });
    
    const result = await issuesCheck.run();
    
    expect(result.message).toBe('15 open issues (0 critical, 0 bugs)');
    expect(result.details.total).toBe(15);
  });

  it('should fall back to page count when search API fails', async () => {
    const mockIssues = [
      { number: 1, title: 'Issue 1', labels: [] },
      { number: 2, title: 'Issue 2', labels: [] }
    ];
    
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue(mockIssues)
    }).mockRejectedValueOnce(new Error('Search API failed'));
    
    const result = await issuesCheck.run();
    
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
    
    (fetch as any).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(mockIssues)
    });
    
    const result = await issuesCheck.run();
    
    expect(result.details.critical).toBe(1);
    expect(result.details.bugs).toBe(1);
  });

  it('should handle issues with no labels', async () => {
    const mockIssues = [
      { number: 1, title: 'Issue without labels', labels: [] }
    ];
    
    (fetch as any).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(mockIssues)
    });
    
    const result = await issuesCheck.run();
    
    expect(result.details.critical).toBe(0);
    expect(result.details.bugs).toBe(0);
  });

  it('should return error when fetch throws an exception', async () => {
    (fetch as any).mockRejectedValue(new Error('Network error'));
    
    const result = await issuesCheck.run();
    
    expect(result.type).toBe('issues');
    expect(result.status).toBe('error');
    expect(result.message).toBe('Issues check failed');
  });

  it('should use correct GitHub API URLs', async () => {
    const mockIssues = [];
    
    (fetch as any).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(mockIssues)
    });
    
    await issuesCheck.run();
    
    expect(fetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/test-org/test-repo/issues?state=open&per_page=100',
      expect.objectContaining({
        headers: {
          Authorization: 'token test-token',
          Accept: 'application/vnd.github.v3+json'
        }
      })
    );

    expect(fetch).toHaveBeenCalledWith(
      'https://api.github.com/search/issues?q=repo:test-org/test-repo+is:issue+is:open',
      expect.objectContaining({
        headers: {
          Authorization: 'token test-token',
          Accept: 'application/vnd.github.v3+json'
        }
      })
    );
  });

  it('should handle search API returning zero total_count', async () => {
    const mockIssues = [
      { number: 1, title: 'Issue 1', labels: [] }
    ];
    
    const mockSearchResponse = {
      total_count: 0
    };
    
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue(mockIssues)
    }).mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue(mockSearchResponse)
    });
    
    const result = await issuesCheck.run();
    
    // Should fall back to page count when total_count is 0
    expect(result.details.total).toBe(1);
  });

  it('should handle large number of issues', async () => {
    const mockIssues = Array(100).fill(0).map((_, i) => (
      { number: i + 1, title: `Issue ${i + 1}`, labels: [] }
    ));
    
    (fetch as any).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(mockIssues)
    });
    
    const result = await issuesCheck.run();
    
    expect(result.details.total).toBe(100);
    expect(result.message).toContain('100 open issues');
  });
});