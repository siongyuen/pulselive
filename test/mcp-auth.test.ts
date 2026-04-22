import { describe, it, expect, vi } from 'vitest';
import { authenticateRequest, parseAuthConfig, AuthConfig, generateApiKey } from '../src/auth';

describe('MCP Authentication Integration', () => {
  describe('authenticateRequest with real headers', () => {
    const validApiKey = 'test-api-key-12345';
    const config: AuthConfig = { enabled: true, apiKey: validApiKey };

    it('should authenticate with Bearer token in headers object', () => {
      const headers = { authorization: `Bearer ${validApiKey}` };
      const result = authenticateRequest(headers, config);
      expect(result.authenticated).toBe(true);
    });

    it('should reject without authorization header', () => {
      const headers = {};
      const result = authenticateRequest(headers, config);
      expect(result.authenticated).toBe(false);
      expect(result.error).toBe('Missing authentication header');
    });

    it('should reject wrong API key', () => {
      const headers = { authorization: 'Bearer wrong-key' };
      const result = authenticateRequest(headers, config);
      expect(result.authenticated).toBe(false);
    });

    it('should handle case-insensitive header names', () => {
      const headers = { Authorization: `Bearer ${validApiKey}` };
      const result = authenticateRequest(headers, config);
      expect(result.authenticated).toBe(true);
    });

    it('should handle array header values', () => {
      const headers = { authorization: [`Bearer ${validApiKey}`] };
      const result = authenticateRequest(headers, config);
      // Arrays should be handled gracefully
      expect(result.authenticated).toBe(false); // Array not supported, should reject
    });
  });

  describe('parseAuthConfig for MCP', () => {
    it('should disable auth by default', () => {
      const config = parseAuthConfig({});
      expect(config.enabled).toBe(false);
    });

    it('should parse mcp.auth section', () => {
      const result = parseAuthConfig({
        mcp: { auth: { enabled: true, apiKey: 'key123' } }
      });
      expect(result.enabled).toBe(true);
      expect(result.apiKey).toBe('key123');
    });

    it('should use PULSETEL_API_KEY env var', () => {
      process.env.PULSETEL_API_KEY = 'env-api-key';
      const result = parseAuthConfig({
        mcp: { auth: { enabled: true } }
      });
      expect(result.apiKey).toBe('env-api-key');
      delete process.env.PULSETEL_API_KEY;
    });

    it('should prefer explicit config over env var', () => {
      process.env.PULSETEL_API_KEY = 'env-key';
      const result = parseAuthConfig({
        mcp: { auth: { enabled: true, apiKey: 'config-key' } }
      });
      expect(result.apiKey).toBe('config-key');
      delete process.env.PULSETEL_API_KEY;
    });
  });

  describe('generateApiKey', () => {
    it('should generate keys suitable for MCP auth', () => {
      const key = generateApiKey();
      expect(key).toHaveLength(64);
      expect(key).toMatch(/^[a-f0-9]+$/);
    });
  });
});
