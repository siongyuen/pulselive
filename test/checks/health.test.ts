import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HealthCheck, HealthDeps, defaultHealthDeps } from '../../src/checks/health';
import { PulseliveConfig } from '../../src/config';

describe('HealthCheck', () => {
  let config: PulseliveConfig;
  let mockDeps: HealthDeps;

  beforeEach(() => {
    config = {};
    // Default DNS resolves to a safe public IP for test domains
    mockDeps = {
      fetch: vi.fn(),
      dnsLookup: vi.fn().mockResolvedValue(['203.0.113.1']),
    };
  });

  it('should return warning when no endpoints configured', async () => {
    const check = new HealthCheck(config, mockDeps);
    const result = await check.run();

    expect(result.type).toBe('health');
    expect(result.status).toBe('warning');
    expect(result.message).toContain('No health endpoints configured');
    expect(mockDeps.fetch).not.toHaveBeenCalled();
  });

  it('should handle successful endpoint checks', async () => {
    config.health = {
      endpoints: [
        { name: 'API', url: 'https://api.example.com/health' },
        { name: 'Admin', url: 'https://admin.example.com/health' }
      ]
    };
    mockDeps.fetch.mockResolvedValue({ status: 200 });

    const check = new HealthCheck(config, mockDeps);
    const result = await check.run();

    expect(result.type).toBe('health');
    expect(result.status).toBe('success');
    expect(result.message).toContain('All endpoints healthy');
  });

  it('should handle endpoint failures', async () => {
    config.health = {
      endpoints: [
        { name: 'API', url: 'https://api.example.com/health' },
        { name: 'Broken', url: 'https://broken.example.com/health' }
      ]
    };
    mockDeps.fetch.mockImplementation((url: string) => {
      if (url.includes('api.example.com')) {
        return Promise.resolve({ status: 200 });
      } else {
        return Promise.resolve({ status: 500 });
      }
    });

    const check = new HealthCheck(config, mockDeps);
    const result = await check.run();

    expect(result.type).toBe('health');
    expect(result.status).toBe('error');
    expect(result.message).toContain('endpoint(s) failed');
  });

  it('should handle mixed endpoint statuses', async () => {
    config.health = {
      endpoints: [
        { name: 'API', url: 'https://api.example.com/health' },
        { name: 'NotFound', url: 'https://notfound.example.com/health' }
      ]
    };
    mockDeps.fetch.mockImplementation((url: string) => {
      if (url.includes('api.example.com')) {
        return Promise.resolve({ status: 200 });
      } else {
        return Promise.resolve({ status: 404 });
      }
    });

    const check = new HealthCheck(config, mockDeps);
    const result = await check.run();

    expect(result.type).toBe('health');
    expect(result.status).toBe('warning');
    expect(result.message).toContain('Some endpoints have issues');
  });

  it('should handle connection failures gracefully', async () => {
    config.health = {
      endpoints: [
        { name: 'Down', url: 'https://down.example.com/health', timeout: 1000 }
      ]
    };
    mockDeps.fetch.mockRejectedValue(new Error('ECONNREFUSED'));

    const check = new HealthCheck(config, mockDeps);
    const result = await check.run();

    expect(result.type).toBe('health');
    expect(result.status).toBe('error');
    expect(result.message).toContain('failed');
  });

  it('should block localhost endpoints (SSRF protection)', async () => {
    config.health = {
      endpoints: [
        { name: 'Local', url: 'http://localhost:9999/health' }
      ]
    };
    // localhost resolves to 127.0.0.1 — blocked
    mockDeps.dnsLookup.mockResolvedValue(['127.0.0.1']);

    const check = new HealthCheck(config, mockDeps);
    const result = await check.run();

    expect(result.type).toBe('health');
    expect(result.status).toBe('error');
    expect(result.message).toContain('endpoint(s) failed');
    expect(mockDeps.fetch).not.toHaveBeenCalled();
  });

  it('should block cloud metadata endpoints (SSRF protection)', async () => {
    config.health = {
      endpoints: [
        { name: 'Metadata', url: 'http://169.254.169.254/latest/meta-data/' }
      ]
    };

    const check = new HealthCheck(config, mockDeps);
    const result = await check.run();

    expect(result.type).toBe('health');
    expect(result.status).toBe('error');
  });

  it('should enforce endpoint limit', async () => {
    const endpoints = Array.from({ length: 25 }, (_, i) => ({
      name: `Endpoint ${i}`,
      url: `https://api${i}.example.com/health`
    }));
    config.health = { endpoints };

    const check = new HealthCheck(config, mockDeps);
    const result = await check.run();

    expect(result.type).toBe('health');
    expect(result.status).toBe('error');
    expect(result.message).toContain('Too many endpoints');
  });

  it('should allow localhost endpoints when allow_local is true', async () => {
    config.health = {
      allow_local: true,
      endpoints: [
        { name: 'Local API', url: 'http://localhost:3000/health' }
      ]
    };
    // With allow_local, localhost resolves to 127.0.0.1 which is allowed
    mockDeps.dnsLookup.mockResolvedValue(['127.0.0.1']);
    mockDeps.fetch.mockResolvedValue({ status: 200 });

    const check = new HealthCheck(config, mockDeps);
    const result = await check.run();

    expect(result.type).toBe('health');
    expect(result.status).toBe('success');
    expect(result.message).toContain('All endpoints healthy');
  });

  it('should block cloud metadata even with allow_local true', async () => {
    config.health = {
      allow_local: true,
      endpoints: [
        { name: 'Metadata', url: 'http://169.254.169.254/latest/meta-data/' }
      ]
    };

    const check = new HealthCheck(config, mockDeps);
    const result = await check.run();

    expect(result.type).toBe('health');
    expect(result.status).toBe('error');
  });

  it('should block AWS IPv6 metadata endpoint (fd00:ec2::254)', async () => {
    config.health = {
      endpoints: [
        { name: 'AWS IPv6 Meta', url: 'http://[fd00:ec2::254]/latest/meta-data/' }
      ]
    };

    const check = new HealthCheck(config, mockDeps);
    const result = await check.run();

    expect(result.type).toBe('health');
    expect(result.status).toBe('error');
  });

  it('should block IPv6 link-local addresses (fe80::)', async () => {
    config.health = {
      endpoints: [
        { name: 'LinkLocal', url: 'http://[fe80::1]/health' }
      ]
    };

    const check = new HealthCheck(config, mockDeps);
    const result = await check.run();

    expect(result.type).toBe('health');
    expect(result.status).toBe('error');
  });

  it('should block IPv6 unique-local addresses (fc00::)', async () => {
    config.health = {
      endpoints: [
        { name: 'ULA', url: 'http://[fc00::1]/health' }
      ]
    };

    const check = new HealthCheck(config, mockDeps);
    const result = await check.run();

    expect(result.type).toBe('health');
    expect(result.status).toBe('error');
  });

  it('should use defaultHealthDeps when no deps provided', () => {
    const check = new HealthCheck(config);
    expect(check).toBeInstanceOf(HealthCheck);
  });

  it('should handle DNS lookup failure gracefully', async () => {
    config.health = {
      endpoints: [
        { name: 'API', url: 'https://unresolvable.example.com/health' }
      ]
    };
    mockDeps.dnsLookup.mockResolvedValue([]); // DNS fails → empty
    mockDeps.fetch.mockResolvedValue({ status: 200 });

    const check = new HealthCheck(config, mockDeps);
    const result = await check.run();

    // Should still work — DNS failure is not a block, fetch will fail naturally
    expect(result.type).toBe('health');
    expect(result.status).toBe('success');
  });

  it('should block hostname that resolves to blocked IP', async () => {
    config.health = {
      endpoints: [
        { name: 'Internal', url: 'https://internal.corp/health' }
      ]
    };
    mockDeps.dnsLookup.mockResolvedValue(['10.0.0.1']); // Resolves to private IP

    const check = new HealthCheck(config, mockDeps);
    const result = await check.run();

    expect(result.type).toBe('health');
    expect(result.status).toBe('error');
    expect(mockDeps.fetch).not.toHaveBeenCalled();
  });
});