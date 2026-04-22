import { describe, it, expect } from 'vitest';
import { authenticateRequest, generateApiKey, parseAuthConfig, AuthConfig } from '../src/auth';

describe('Authentication', () => {
  describe('generateApiKey', () => {
    it('should generate a 64-character hex string', () => {
      const key = generateApiKey();
      expect(key).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should generate unique keys', () => {
      const key1 = generateApiKey();
      const key2 = generateApiKey();
      expect(key1).not.toBe(key2);
    });
  });

  describe('authenticateRequest', () => {
    const validApiKey = 'test-api-key-12345';
    const config: AuthConfig = { enabled: true, apiKey: validApiKey };

    it('should allow requests when auth is disabled', () => {
      const result = authenticateRequest({}, { enabled: false });
      expect(result.authenticated).toBe(true);
    });

    it('should reject when auth enabled but no API key set', () => {
      const result = authenticateRequest({}, { enabled: true });
      expect(result.authenticated).toBe(false);
      expect(result.error).toContain('misconfiguration');
    });

    it('should reject requests without auth header', () => {
      const result = authenticateRequest({}, config);
      expect(result.authenticated).toBe(false);
      expect(result.error).toBe('Missing authentication header');
    });

    it('should reject requests with invalid token', () => {
      const result = authenticateRequest(
        { authorization: 'Bearer wrong-key' },
        config
      );
      expect(result.authenticated).toBe(false);
      expect(result.error).toBe('Invalid authentication token');
    });

    it('should accept valid bearer token', () => {
      const result = authenticateRequest(
        { authorization: `Bearer ${validApiKey}` },
        config
      );
      expect(result.authenticated).toBe(true);
    });

    it('should accept plain token without Bearer prefix', () => {
      const result = authenticateRequest(
        { authorization: validApiKey },
        config
      );
      expect(result.authenticated).toBe(true);
    });

    it('should reject token that is too long', () => {
      const longToken = 'a'.repeat(300);
      const result = authenticateRequest(
        { authorization: longToken },
        config
      );
      expect(result.authenticated).toBe(false);
    });

    it('should use timing-safe comparison (same length wrong token)', () => {
      const wrongKey = 'test-api-key-WRONG';
      const result = authenticateRequest(
        { authorization: wrongKey },
        config
      );
      expect(result.authenticated).toBe(false);
    });

    it('should support custom header name', () => {
      const customConfig: AuthConfig = {
        enabled: true,
        apiKey: validApiKey,
        headerName: 'X-API-Key'
      };
      const result = authenticateRequest(
        { 'x-api-key': validApiKey },
        customConfig
      );
      expect(result.authenticated).toBe(true);
    });
  });

  describe('parseAuthConfig', () => {
    it('should return disabled config when no auth section', () => {
      const result = parseAuthConfig({});
      expect(result.enabled).toBe(false);
    });

    it('should parse mcp.auth section', () => {
      const result = parseAuthConfig({
        mcp: { auth: { enabled: true, apiKey: 'key123' } }
      });
      expect(result.enabled).toBe(true);
      expect(result.apiKey).toBe('key123');
    });

    it('should fall back to top-level auth section', () => {
      const result = parseAuthConfig({
        auth: { enabled: true, apiKey: 'key456' }
      });
      expect(result.enabled).toBe(true);
      expect(result.apiKey).toBe('key456');
    });

    it('should use environment variable as fallback', () => {
      process.env.PULSETEL_API_KEY = 'env-key';
      const result = parseAuthConfig({ mcp: { auth: { enabled: true } } });
      expect(result.apiKey).toBe('env-key');
      delete process.env.PULSETEL_API_KEY;
    });
  });
});
