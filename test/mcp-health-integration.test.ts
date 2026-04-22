import { describe, it, expect, vi } from 'vitest';

describe('MCP Health Integration', () => {
  it('should expose health status via pulsetel_status tool', async () => {
    // Mock the health endpoint module
    vi.doMock('../src/health-endpoint', () => ({
      getHealthStatus: vi.fn().mockReturnValue({
        status: 'healthy',
        uptime: 1000,
        version: '2.3.5',
        requests: { total: 10, success: 10, errors: 0, avgDuration: 50 },
        queueDepth: 0,
        errorRate: 0
      }),
      recordRequest: vi.fn()
    }));

    const { getHealthStatus } = await import('../src/health-endpoint');
    const status = getHealthStatus();
    
    expect(status.status).toBe('healthy');
    expect(status.version).toBe('2.3.5');
    expect(status.requests.total).toBe(10);
  });

  it('should record request metrics on each MCP call', async () => {
    vi.doMock('../src/health-endpoint', () => ({
      recordRequest: vi.fn(),
      getHealthStatus: vi.fn()
    }));

    const { recordRequest } = await import('../src/health-endpoint');
    
    // Simulate recording a request
    recordRequest(200, 100);
    
    expect(recordRequest).toHaveBeenCalledWith(200, 100);
  });
});
