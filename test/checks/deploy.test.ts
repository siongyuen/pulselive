import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeployCheck } from '../../src/checks/deploy';
import fetch from 'node-fetch';

vi.mock('node-fetch');

describe('DeployCheck', () => {
  let deployCheck: DeployCheck;
  let mockConfig: any;

  beforeEach(() => {
    mockConfig = {
      github: {
        repo: 'test-org/test-repo',
        token: 'test-token'
      }
    };
    deployCheck = new DeployCheck(mockConfig);
  });

  it('should return warning when no repository configured', async () => {
    const config = { github: {} };
    const check = new DeployCheck(config);
    
    const result = await check.run();
    
    expect(result.type).toBe('deploy');
    expect(result.status).toBe('warning');
    expect(result.message).toBe('No GitHub repository configured');
  });

  it('should return warning when no token provided', async () => {
    const config = { github: { repo: 'test-org/test-repo' } };
    const check = new DeployCheck(config);
    
    const result = await check.run();
    
    expect(result.type).toBe('deploy');
    expect(result.status).toBe('warning');
    expect(result.message).toBe('No GitHub token provided, skipping deploy check');
  });

  it('should return error when GitHub API returns non-200 status', async () => {
    (fetch as any).mockResolvedValue({
      ok: false,
      status: 500
    });
    
    const result = await deployCheck.run();
    
    expect(result.type).toBe('deploy');
    expect(result.status).toBe('error');
    expect(result.message).toBe('GitHub API error: 500');
  });

  it('should return warning when GitHub API returns auth failure', async () => {
    (fetch as any).mockResolvedValue({
      ok: false,
      status: 401
    });
    
    const result = await deployCheck.run();
    
    expect(result.type).toBe('deploy');
    expect(result.status).toBe('warning');
    expect(result.message).toBe('GitHub auth failed. Check your token.');
  });

  it('should return warning when no deployments found', async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([])
    });
    
    const result = await deployCheck.run();
    
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
    
    (fetch as any).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([mockDeployment])
    });
    
    const result = await deployCheck.run();
    
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
    
    (fetch as any).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([mockDeployment])
    });
    
    const result = await deployCheck.run();
    
    expect(result.type).toBe('deploy');
    expect(result.status).toBe('error');
    expect(result.message).toBe('Latest deployment: production (error)');
    expect(result.details).toEqual({
      deploymentId: 123,
      createdAt: '2023-01-01T00:00:00Z'
    });
  });

  it('should return error when latest deployment has failure status', async () => {
    const mockDeployment = {
      id: 123,
      environment: 'production',
      state: 'failure',
      created_at: '2023-01-01T00:00:00Z'
    };
    
    (fetch as any).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([mockDeployment])
    });
    
    const result = await deployCheck.run();
    
    expect(result.type).toBe('deploy');
    expect(result.status).toBe('error');
    expect(result.message).toBe('Latest deployment: production (failure)');
  });

  it('should return warning when latest deployment has pending status', async () => {
    const mockDeployment = {
      id: 123,
      environment: 'production',
      state: 'pending',
      created_at: '2023-01-01T00:00:00Z'
    };
    
    (fetch as any).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([mockDeployment])
    });
    
    const result = await deployCheck.run();
    
    expect(result.type).toBe('deploy');
    expect(result.status).toBe('warning');
    expect(result.message).toBe('Latest deployment: production (pending)');
  });

  it('should return warning when latest deployment has no state', async () => {
    const mockDeployment = {
      id: 123,
      environment: 'production',
      created_at: '2023-01-01T00:00:00Z'
    };
    
    (fetch as any).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([mockDeployment])
    });
    
    const result = await deployCheck.run();
    
    expect(result.type).toBe('deploy');
    expect(result.status).toBe('warning');
    expect(result.message).toBe('Latest deployment: production (pending)');
  });

  it('should return error when fetch throws an exception', async () => {
    (fetch as any).mockRejectedValue(new Error('Network error'));
    
    const result = await deployCheck.run();
    
    expect(result.type).toBe('deploy');
    expect(result.status).toBe('error');
    expect(result.message).toBe('Deploy check failed');
  });

  it('should use correct GitHub API URL', async () => {
    const mockDeployment = {
      id: 123,
      environment: 'production',
      state: 'success',
      created_at: '2023-01-01T00:00:00Z'
    };
    
    (fetch as any).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([mockDeployment])
    });
    
    await deployCheck.run();
    
    expect(fetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/test-org/test-repo/deployments',
      expect.objectContaining({
        headers: {
          Authorization: 'token test-token',
          Accept: 'application/vnd.github.v3+json'
        }
      })
    );
  });

  it('should handle deployment with different environment names', async () => {
    const mockDeployment = {
      id: 123,
      environment: 'staging',
      state: 'success',
      created_at: '2023-01-01T00:00:00Z'
    };
    
    (fetch as any).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([mockDeployment])
    });
    
    const result = await deployCheck.run();
    
    expect(result.message).toBe('Latest deployment: staging (success)');
  });
});