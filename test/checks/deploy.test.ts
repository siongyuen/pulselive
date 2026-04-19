import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeployCheck } from '../../src/checks/deploy';
import { GitHubDeps, defaultGitHubDeps } from '../../src/checks/github-deps';

describe('DeployCheck', () => {
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
    const check = new DeployCheck(config, mockDeps);
    
    const result = await check.run();
    
    expect(result.type).toBe('deploy');
    expect(result.status).toBe('warning');
    expect(result.message).toBe('No GitHub repository configured');
    expect(mockDeps.fetch).not.toHaveBeenCalled();
  });

  it('should return warning when no token provided', async () => {
    const config = { github: { repo: 'test-org/test-repo' } };
    const check = new DeployCheck(config, mockDeps);
    
    const result = await check.run();
    
    expect(result.type).toBe('deploy');
    expect(result.status).toBe('warning');
    expect(result.message).toBe('No GitHub token provided, skipping deploy check');
    expect(mockDeps.fetch).not.toHaveBeenCalled();
  });

  it('should return error when GitHub API returns non-200 status', async () => {
    mockDeps.fetch.mockResolvedValue({
      ok: false,
      status: 500
    });
    
    const check = new DeployCheck(mockConfig, mockDeps);
    const result = await check.run();
    
    expect(result.type).toBe('deploy');
    expect(result.status).toBe('error');
    expect(result.message).toBe('GitHub API error: 500');
  });

  it('should return warning when GitHub API returns auth failure', async () => {
    mockDeps.fetch.mockResolvedValue({
      ok: false,
      status: 401
    });
    
    const check = new DeployCheck(mockConfig, mockDeps);
    const result = await check.run();
    
    expect(result.type).toBe('deploy');
    expect(result.status).toBe('warning');
    expect(result.message).toBe('GitHub auth failed. Check your token.');
  });

  it('should return warning when no deployments found', async () => {
    mockDeps.fetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([])
    });
    
    const check = new DeployCheck(mockConfig, mockDeps);
    const result = await check.run();
    
    expect(result.type).toBe('deploy');
    expect(result.status).toBe('warning');
    expect(result.message).toBe('No deployments found');
  });

  it('should return success when latest deployment is successful', async () => {
    const mockDeployment = {
      id: 123,
      environment: 'production',
      state: 'success',
      created_at: '2023-01-01T00:00:00Z'
    };
    
    mockDeps.fetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([mockDeployment])
    });
    
    const check = new DeployCheck(mockConfig, mockDeps);
    const result = await check.run();
    
    expect(result.type).toBe('deploy');
    expect(result.status).toBe('success');
    expect(result.message).toBe('Latest deployment: production (success)');
    expect(result.details).toEqual({
      deploymentId: 123,
      createdAt: '2023-01-01T00:00:00Z'
    });
  });

  it('should return error when latest deployment has error status', async () => {
    const mockDeployment = {
      id: 123,
      environment: 'production',
      state: 'error',
      created_at: '2023-01-01T00:00:00Z'
    };
    
    mockDeps.fetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([mockDeployment])
    });
    
    const check = new DeployCheck(mockConfig, mockDeps);
    const result = await check.run();
    
    expect(result.type).toBe('deploy');
    expect(result.status).toBe('error');
    expect(result.message).toBe('Latest deployment: production (error)');
  });

  it('should return warning when latest deployment has pending status', async () => {
    const mockDeployment = {
      id: 123,
      environment: 'production',
      state: 'pending',
      created_at: '2023-01-01T00:00:00Z'
    };
    
    mockDeps.fetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([mockDeployment])
    });
    
    const check = new DeployCheck(mockConfig, mockDeps);
    const result = await check.run();
    
    expect(result.type).toBe('deploy');
    expect(result.status).toBe('warning');
    expect(result.message).toBe('Latest deployment: production (pending)');
  });

  it('should return error when fetch throws an exception', async () => {
    mockDeps.fetch.mockRejectedValue(new Error('Network error'));
    
    const check = new DeployCheck(mockConfig, mockDeps);
    const result = await check.run();
    
    expect(result.type).toBe('deploy');
    expect(result.status).toBe('error');
    expect(result.message).toBe('Deploy check failed');
  });

  it('should use correct GitHub API URL and headers', async () => {
    const mockDeployment = {
      id: 123,
      environment: 'production',
      state: 'success',
      created_at: '2023-01-01T00:00:00Z'
    };
    
    mockDeps.fetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([mockDeployment])
    });
    
    const check = new DeployCheck(mockConfig, mockDeps);
    await check.run();
    
    expect(mockDeps.fetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/test-org/test-repo/deployments',
      {
        headers: {
          Authorization: 'token test-token',
          Accept: 'application/vnd.github.v3+json'
        }
      }
    );
  });

  it('should use defaultGitHubDeps when no deps provided', () => {
    const check = new DeployCheck(mockConfig);
    expect(check).toBeInstanceOf(DeployCheck);
  });
});