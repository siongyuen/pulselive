import { describe, it, expect, vi } from 'vitest';

describe('Self-Health Endpoint', () => {
  // Reset metrics before each test by re-importing
  const importFresh = async () => {
    // Use dynamic import to get fresh module state
    const module = await import('../src/health-endpoint?version=' + Date.now());
    return module;
  };

  it('should return server status', async () => {
    const { getHealthStatus } = await importFresh();
    const status = getHealthStatus();
    
    expect(status.status).toBe('healthy');
    expect(status.timestamp).toBeDefined();
    expect(status.version).toBeDefined();
    expect(status.uptime).toBeGreaterThanOrEqual(0);
  });

  it('should include request metrics', async () => {
    const { getHealthStatus, recordRequest } = await importFresh();
    
    recordRequest(200, 100);
    recordRequest(200, 150);
    recordRequest(500, 50);
    
    const status = getHealthStatus();
    
    expect(status.requests.total).toBe(3);
    expect(status.requests.success).toBe(2);
    expect(status.requests.errors).toBe(1);
    expect(status.requests.avgDuration).toBe(100); // (100 + 150 + 50) / 3
  });

  it('should track queue depth', async () => {
    const { getHealthStatus, setQueueDepth } = await importFresh();
    
    setQueueDepth(5);
    
    const status = getHealthStatus();
    expect(status.queueDepth).toBe(5);
  });

  it('should detect unhealthy state on high error rate', async () => {
    const { getHealthStatus, recordRequest } = await importFresh();
    
    // Simulate 60% error rate (more than 50% = unhealthy)
    for (let i = 0; i < 10; i++) {
      recordRequest(i < 6 ? 500 : 200, 100);
    }
    
    const status = getHealthStatus();
    expect(status.status).toBe('unhealthy');
    expect(status.errorRate).toBeGreaterThan(0.5);
  });

  it('should classify 4xx as errors, not success', async () => {
    const { getHealthStatus, recordRequest } = await importFresh();
    
    // 401 Unauthorized should be an error
    recordRequest(401, 50);
    
    const status = getHealthStatus();
    expect(status.requests.success).toBe(0);
    expect(status.requests.errors).toBe(1);
    expect(status.errorRate).toBe(1);
    expect(status.status).toBe('unhealthy');
  });

  it('should classify 3xx as success', async () => {
    const { getHealthStatus, recordRequest } = await importFresh();
    
    recordRequest(301, 50);
    
    const status = getHealthStatus();
    expect(status.requests.success).toBe(1);
    expect(status.requests.errors).toBe(0);
  });
});
