import { PulseliveConfig } from '../config';
import { CheckResult } from '../scanner';
import fetch from 'node-fetch';

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

      const results: Array<{ name: string; status: number; responseTime: number; error?: string }> = [];

      for (const endpoint of endpoints) {
        const timeout = endpoint.timeout || 5000; // Default 5 second timeout
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), timeout);
          
          const startTime = Date.now();
          const response = await fetch(endpoint.url, {
            method: 'GET',
            signal: controller.signal as AbortSignal
          });
          const responseTime = Date.now() - startTime;
          clearTimeout(timeoutId);

          results.push({
            name: endpoint.name,
            status: response.status,
            responseTime
          });
        } catch (error: any) {
          const responseTime = Date.now() - (Date.now()); // Will be overridden
          const isTimeout = error.name === 'AbortError';
          results.push({
            name: endpoint.name,
            status: 0,
            responseTime: timeout,
            error: isTimeout ? `Timeout after ${timeout}ms` : (error.message || 'Connection failed')
          });
        }
      }

      const healthyResults = results.filter(r => r.status >= 200 && r.status < 300);
      const failedResults = results.filter(r => r.error || r.status >= 500);

      if (healthyResults.length === results.length) {
        return {
          type: 'health',
          status: 'success',
          message: `All endpoints healthy (${results.length} checked)`,
          details: results
        };
      } else if (failedResults.length > 0) {
        return {
          type: 'health',
          status: 'error',
          message: `${failedResults.length} endpoint(s) failed`,
          details: results
        };
      } else {
        return {
          type: 'health',
          status: 'warning',
          message: `Some endpoints have issues`,
          details: results
        };
      }
    } catch (error) {
      return {
        type: 'health',
        status: 'error',
        message: `Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
}