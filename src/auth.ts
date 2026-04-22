import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

/**
 * API Key authentication for MCP HTTP endpoint.
 * Supports bearer token or API key header.
 */

const MAX_API_KEY_LENGTH = 256;

export interface AuthConfig {
  enabled: boolean;
  apiKey?: string;
  headerName?: string;
}

export interface AuthResult {
  authenticated: boolean;
  error?: string;
}

/**
 * Parse authentication header and validate API key.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export function authenticateRequest(
  headers: Record<string, string | string[] | undefined>,
  config: AuthConfig
): AuthResult {
  if (!config.enabled) {
    return { authenticated: true };
  }

  const apiKey = config.apiKey;
  if (!apiKey) {
    return { authenticated: false, error: 'Server misconfiguration: auth enabled but no API key set' };
  }

  const headerName = (config.headerName || 'Authorization').toLowerCase();
  
  // Look up header case-insensitively
  let authHeader: string | string[] | undefined;
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === headerName) {
      authHeader = value;
      break;
    }
  }

  if (!authHeader || typeof authHeader !== 'string') {
    return { authenticated: false, error: 'Missing authentication header' };
  }

  // Support Bearer token format: "Bearer <token>" or plain "<token>"
  let token: string;
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch) {
    token = bearerMatch[1];
  } else {
    token = authHeader;
  }

  if (!token || token.length > MAX_API_KEY_LENGTH) {
    return { authenticated: false, error: 'Invalid authentication token' };
  }

  // Timing-safe comparison
  const expectedBuffer = Buffer.from(apiKey, 'utf8');
  const actualBuffer = Buffer.from(token, 'utf8');

  if (expectedBuffer.length !== actualBuffer.length) {
    return { authenticated: false, error: 'Invalid authentication token' };
  }

  try {
    const match = timingSafeEqual(expectedBuffer, actualBuffer);
    if (!match) {
      return { authenticated: false, error: 'Invalid authentication token' };
    }
  } catch {
    return { authenticated: false, error: 'Invalid authentication token' };
  }

  return { authenticated: true };
}

/**
 * Generate a secure random API key.
 * Returns a hex string of 64 characters (32 bytes).
 */
export function generateApiKey(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Parse auth configuration from PulsetelConfig.
 */
export function parseAuthConfig(config: any): AuthConfig {
  const auth = config?.mcp?.auth || config?.auth;
  if (!auth) {
    return { enabled: false };
  }

  return {
    enabled: auth.enabled === true,
    apiKey: auth.apiKey || process.env.PULSETEL_API_KEY,
    headerName: auth.headerName || 'Authorization'
  };
}
