import { PulseliveConfig } from '../config';
import { CheckResult } from '../scanner';
import fetch from 'node-fetch';

/**
 * Blocked IP ranges to prevent SSRF:
 * - 127.0.0.0/8 (loopback)
 * - 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16 (RFC1918 private)
 * - 169.254.0.0/16 (link-local / cloud metadata)
 * - 0.0.0.0/8 (current network)
 * - ::1 (IPv6 loopback)
 * - fc00::/7 (IPv6 unique local)
 * - fe80::/10 (IPv6 link-local)
 */
const BLOCKED_IPV4 = [
  { start: 0x0A000000, end: 0x0AFFFFFF },   // 10.0.0.0/8
  { start: 0xAC100000, end: 0xAC1FFFFF },   // 172.16.0.0/12
  { start: 0xC0A80000, end: 0xC0A8FFFF },   // 192.168.0.0/16
  { start: 0x7F000000, end: 0x7FFFFFFF },   // 127.0.0.0/8
  { start: 0xA9FE0000, end: 0xA9FEFFFF },   // 169.254.0.0/16
  { start: 0x00000000, end: 0x00000000 },   // 0.0.0.0/8
];

const MAX_ENDPOINTS = 20;
const MIN_TIMEOUT = 1000;   // 1 second
const MAX_TIMEOUT = 30000;  // 30 seconds

function ipv4ToInt(ip: string): number {
  const parts = ip.split('.').map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function isBlockedIP(ip: string): boolean {
  // IPv6 checks
  if (ip === '::1') return true;                           // Loopback
  if (isIPv6InRanges(ip)) return true;                      // Private/link-local/metadata

  // IPv4 checks
  const match = ip.match(/^(\d{1,3}\.){3}\d{1,3}$/);
  if (match) {
    const val = ipv4ToInt(ip);
    return BLOCKED_IPV4.some(range => val >= range.start && val <= range.end);
  }

  return false;
}

/**
 * Check IPv6 addresses against blocked ranges:
 * - fc00::/7  (unique local — includes fd00:ec2::254 AWS metadata)
 * - fe80::/10 (link-local)
 * - ::1       (loopback — handled above)
 * - ff00::/8  (multicast)
 */
function isIPv6InRanges(ip: string): boolean {
  // Normalize: remove brackets, lowercase
  const normalized = ip.replace(/[\[\]]/g, '').toLowerCase();

  // Only process valid IPv6 addresses
  if (!normalized.includes(':')) return false;

  // Expand :: shorthand for comparison
  const parts = expandIPv6(normalized);
  if (!parts) return false;

  const firstHex = parseInt(parts[0], 16);

  // fc00::/7 — unique local (first 7 bits = 0xfc or 0xfd)
  // In hex: first byte starts with fc or fd
  if (firstHex >= 0xfc00 && firstHex <= 0xfdff) return true;

  // fe80::/10 — link-local (first 10 bits = 0xfe8)
  if (firstHex >= 0xfe80 && firstHex <= 0xfebf) return true;

  // ff00::/8 — multicast
  if (firstHex >= 0xff00 && firstHex <= 0xffff) return true;

  return false;
}

/**
 * Expand an IPv6 address into 8 hextets.
 * e.g. "fd00:ec2::254" → ["fd00","00ec","0000","0000","0000","0000","0000","0254"]
 */
function expandIPv6(ip: string): string[] | null {
  try {
    // Handle :: expansion
    const halves = ip.split('::');
    if (halves.length > 2) return null; // Invalid: multiple ::

    let left: string[], right: string[];
    if (halves.length === 2) {
      left = halves[0] ? halves[0].split(':') : [];
      right = halves[1] ? halves[1].split(':') : [];
      const missing = 8 - left.length - right.length;
      if (missing < 0) return null;
      const expanded = [...left, ...Array(missing).fill('0'), ...right];
      return expanded.map(h => h.padStart(4, '0'));
    }

    // No :: — must be exactly 8 hextets
    const parts = ip.split(':');
    if (parts.length !== 8) return null;
    return parts.map(h => h.padStart(4, '0'));
  } catch {
    return null;
  }
}

/**
 * Resolve hostname and check that resolved IPs are not in blocked ranges.
 * Returns:
 *  - 'safe' if resolution succeeded and IP is not blocked
 *  - 'blocked' if all resolved IPs are in blocked ranges
 *  - 'unknown' if DNS resolution failed (not blocked, just unresolvable)
 */
async function resolveAndValidate(hostname: string): Promise<'safe' | 'blocked' | 'unknown'> {
  const dns = require('dns');
  return new Promise((resolve) => {
    dns.lookup(hostname, { all: true }, (err: any, addresses: Array<{ address: string }>) => {
      if (err || !addresses || addresses.length === 0) {
        // DNS failed — can't determine if blocked. Let it through and let fetch fail naturally.
        resolve('unknown');
        return;
      }
      for (const addr of addresses) {
        if (!isBlockedIP(addr.address)) {
          resolve('safe');
          return;
        }
      }
      // All resolved IPs are blocked
      resolve('blocked');
    });
  });
}

export class HealthCheck {
  private config: PulseliveConfig;

  constructor(config: PulseliveConfig) {
    this.config = config;
  }

  async run(): Promise<CheckResult> {
    try {
      const endpoints = this.config.health?.endpoints || [];

      if (endpoints.length === 0) {
        return {
          type: 'health',
          status: 'warning',
          message: 'No health endpoints configured'
        };
      }

      // Enforce endpoint limit
      if (endpoints.length > MAX_ENDPOINTS) {
        return {
          type: 'health',
          status: 'error',
          message: `Too many endpoints configured (${endpoints.length}). Maximum is ${MAX_ENDPOINTS}.`
        };
      }

      const results: Array<{ name: string; status: number; responseTime: number; error?: string; baseline?: number; url?: string }> = [];

      for (const endpoint of endpoints) {
        // Validate timeout bounds
        const rawTimeout = endpoint.timeout || 5000;
        const timeout = Math.max(MIN_TIMEOUT, Math.min(MAX_TIMEOUT, rawTimeout));

        // SSRF protection: validate URL and resolve hostname
        const urlValidation = await this.validateEndpointUrl(endpoint.url);
        if (!urlValidation.safe) {
          results.push({
            name: endpoint.name,
            url: endpoint.url,
            status: 0,
            responseTime: 0,
            error: urlValidation.reason || 'URL not allowed'
          });
          continue;
        }

        const startTime = Date.now();
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), timeout);

          const response = await fetch(endpoint.url, {
            method: 'GET',
            signal: controller.signal as AbortSignal,
            redirect: 'manual' // Don't follow redirects — prevents redirect-based SSRF
          });
          const responseTime = Date.now() - startTime;
          clearTimeout(timeoutId);

          const baseline = endpoint.baseline || 0;
          results.push({
            name: endpoint.name,
            url: endpoint.url,
            status: response.status,
            responseTime,
            baseline: baseline
          });
        } catch (error: any) {
          const elapsed = Date.now() - startTime;
          const isTimeout = error.name === 'AbortError';
          const baseline = endpoint.baseline || 0;
          results.push({
            name: endpoint.name,
            url: endpoint.url,
            status: 0,
            responseTime: elapsed,
            baseline: baseline,
            error: isTimeout ? `Timeout after ${timeout}ms` : (error.message || 'Connection failed')
          });
        }
      }

      const healthyResults = results.filter(r => r.status >= 200 && r.status < 300);
      const failedResults = results.filter(r => r.error || r.status >= 500);
      const performanceWarnings = results.filter(r => {
        if (r.baseline && r.responseTime > 0) {
          const ratio = r.responseTime / r.baseline;
          return ratio > 2 && ratio <= 5; // Warning: 2x-5x baseline
        }
        return false;
      });
      const performanceErrors = results.filter(r => {
        if (r.baseline && r.responseTime > 0) {
          const ratio = r.responseTime / r.baseline;
          return ratio > 5 || r.responseTime > 10000; // Error: >5x baseline or >10s
        }
        return false;
      });

      // Calculate average latency for metrics
      const successfulEndpoints = results.filter(r => r.status >= 200 && r.status < 300);
      const avgLatency = successfulEndpoints.length > 0 
        ? successfulEndpoints.reduce((sum, r) => sum + (r.responseTime || 0), 0) / successfulEndpoints.length
        : 0;

      if (healthyResults.length === results.length && performanceWarnings.length === 0 && performanceErrors.length === 0) {
        return {
          type: 'health',
          status: 'success',
          message: `All endpoints healthy (${results.length} checked, avg ${Math.round(avgLatency)}ms)`,
          details: results
        };
      } else if (failedResults.length > 0 || performanceErrors.length > 0) {
        return {
          type: 'health',
          status: 'error',
          message: `${failedResults.length} endpoint(s) failed, ${performanceErrors.length} performance issue(s), avg ${Math.round(avgLatency)}ms`,
          details: results
        };
      } else if (performanceWarnings.length > 0) {
        return {
          type: 'health',
          status: 'warning',
          message: `${performanceWarnings.length} endpoint(s) with performance warnings, avg ${Math.round(avgLatency)}ms`,
          details: results
        };
      } else {
        return {
          type: 'health',
          status: 'warning',
          message: `Some endpoints have issues, avg ${Math.round(avgLatency)}ms`,
          details: results
        };
      }
    } catch (error) {
      return {
        type: 'health',
        status: 'error',
        message: 'Health check failed'
      };
    }
  }

  /**
   * Validate that a URL is safe to fetch:
   * - Must be HTTP or HTTPS
   * - If allow_local is true, skip IP range checks (user explicitly trusts local endpoints)
   * - Otherwise, hostname must resolve to a non-blocked IP
   * - Always blocks cloud metadata endpoints (169.254.x.x) even with allow_local
   */
  private async validateEndpointUrl(urlStr: string): Promise<{ safe: boolean; reason?: string }> {
    let parsed: URL;
    try {
      parsed = new URL(urlStr);
    } catch {
      return { safe: false, reason: 'Invalid URL' };
    }

    // Only allow http/https
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { safe: false, reason: `Unsupported protocol: ${parsed.protocol}` };
    }

    const hostname = parsed.hostname;
    const allowLocal = this.config.health?.allow_local === true;

    // Always block cloud metadata IPs even with allow_local
    const isMetadataIP = (ip: string) => {
      if (!ip.match(/^[\d.]+$/)) return false;
      const val = ipv4ToInt(ip);
      return val >= 0xA9FE0000 && val <= 0xA9FEFFFF; // 169.254.0.0/16
    };

    if (allowLocal) {
      // With allow_local, only block cloud metadata — allow loopback, RFC1918
      if (hostname.match(/^[\d.]+$/) && isMetadataIP(hostname)) {
        return { safe: false, reason: 'Cloud metadata endpoint blocked (169.254.x.x)' };
      }
      // Also check if hostname resolves to metadata IP
      if (!hostname.match(/^[\d.]+$/)) {
        const result = await resolveAndValidate(hostname);
        // For allow_local we only block metadata IPs, not private/loopback
        // resolveAndValidate blocks all — so we do a targeted check instead
        const dns = require('dns');
        const ips = await new Promise<string[]>((resolve) => {
          dns.lookup(hostname, { all: true }, (err: any, addrs: Array<{ address: string }>) => {
            if (err || !addrs) { resolve([]); return; }
            resolve(addrs.map(a => a.address));
          });
        });
        if (ips.some(ip => isMetadataIP(ip))) {
          return { safe: false, reason: 'Hostname resolves to cloud metadata IP (169.254.x.x)' };
        }
      }
      return { safe: true };
    }

    // Without allow_local — full SSRF protection
    // Block if hostname is a raw IP in blocked ranges
    if (hostname.match(/^[\d.]+$/) || hostname.startsWith('[')) {
      if (isBlockedIP(hostname.replace(/[\[\]]/g, ''))) {
        return { safe: false, reason: 'Target IP is in a blocked range (private/metadata/loopback)' };
      }
    } else {
      // Hostname is a domain — resolve it and check resolved IPs
      const result = await resolveAndValidate(hostname);
      if (result === 'blocked') {
        return { safe: false, reason: 'Hostname resolves to a blocked IP range (private/metadata/loopback)' };
      }
      // If 'unknown' (DNS failed) or 'safe', allow through — fetch will fail naturally if unresolvable
    }

    return { safe: true };
  }
}