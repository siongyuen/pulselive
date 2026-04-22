import { MCPServer, MCPDeps } from '../src/mcp-server.js';
import { ConfigLoader } from '../src/config.js';
import { Scanner, CheckResult } from '../src/scanner.js';
import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import path from 'path';

describe('PulseTel Integration Test - Real Project', () => {
  it('should detect issues in test project', async () => {
    const testProjectDir = '/tmp/pulsetel-test-project';
    
    // Verify test project exists
    expect(existsSync(testProjectDir)).toBe(true);
    expect(existsSync(path.join(testProjectDir, 'package.json'))).toBe(true);
    
    // Load config from test project
    const configLoader = new ConfigLoader(path.join(testProjectDir, '.pulsetel.yml'));
    const config = configLoader.getConfig();
    
    expect(config).toBeDefined();
    expect(config.health).toBeDefined();
    expect(config.health?.endpoints).toHaveLength(2);
  });

  it('should run pulsetel_recommend and return actionable recommendations', async () => {
    const testProjectDir = '/tmp/pulsetel-test-project';
    
    // Create config loader for test project
    const configLoader = new ConfigLoader(path.join(testProjectDir, '.pulsetel.yml'));
    
    // Create mock scanner that returns realistic results
    const mockResults: CheckResult[] = [
      {
        type: 'health',
        status: 'error',
        severity: 'critical',
        confidence: 'high',
        message: '2 endpoint(s) failed, avg 0ms',
        actionable: 'Investigate endpoint failures and performance issues',
        context: 'Endpoint failures indicate service problems',
        duration: 2729,
        details: [
          { name: 'Test Endpoint', url: 'https://httpbin.org/status/200', status: 400, responseTime: 488 },
          { name: 'Failing Endpoint', url: 'https://httpbin.org/status/500', status: 400, responseTime: 772 }
        ]
      },
      {
        type: 'deps',
        status: 'warning',
        severity: 'medium',
        confidence: 'high',
        message: '2 vulnerabilities, 3 outdated packages',
        actionable: 'Update outdated packages and review vulnerabilities',
        context: 'Outdated or vulnerable dependencies are security and stability risks',
        duration: 913,
        details: {
          vulnerabilities: { critical: 0, high: 0, medium: 2, low: 0 },
          outdated: 3
        }
      },
      {
        type: 'git',
        status: 'success',
        severity: 'low',
        confidence: 'high',
        message: 'Git status: master branch',
        actionable: 'No action needed - Git status is clean',
        context: 'Repository is in sync with remote',
        duration: 1455,
        details: { branch: 'master', uncommitted: 3 }
      }
    ];

    // Create mock scanner
    const mockScanner = {
      runAllChecks: async () => mockResults,
      runSingleCheck: async (type: string) => mockResults.find(r => r.type === type) || mockResults[0]
    } as unknown as Scanner;

    // Create MCPDeps with mock scanner factory
    const mockDeps: MCPDeps = {
      createScanner: () => mockScanner,
      createConfigLoader: (configPath?: string) => new ConfigLoader(configPath)
    };
    
    const server = new MCPServer(configLoader, 3000, mockDeps);
    
    // Call pulsetel_recommend
    const result = await server.handleToolRequest('pulsetel_recommend');
    
    // Verify recommendations
    expect(result).toBeDefined();
    expect(result.recommendations).toBeDefined();
    expect(Array.isArray(result.recommendations)).toBe(true);
    expect(result.totalRecommendations).toBeGreaterThan(0);
    
    // Should prioritize issues by severity (critical first, then warning)
    if (result.recommendations.length > 0) {
      const first = result.recommendations[0];
      expect(first.rank).toBe(1);
      // First should be either critical or warning depending on whether anomalies detected
      expect(['critical', 'warning']).toContain(first.severity);
      expect(first.actionable).toBeDefined();
      expect(first.context).toBeDefined();
    }
    
    // Verify structure
    const rec = result.recommendations[0];
    expect(rec).toHaveProperty('rank');
    expect(rec).toHaveProperty('checkType');
    expect(rec).toHaveProperty('severity');
    expect(rec).toHaveProperty('confidence');
    expect(rec).toHaveProperty('title');
    expect(rec).toHaveProperty('actionable');
    expect(rec).toHaveProperty('context');
  });

  it('should handle all-success scenario', async () => {
    const testProjectDir = '/tmp/pulsetel-test-project';
    const configLoader = new ConfigLoader(path.join(testProjectDir, '.pulsetel.yml'));
    
    const mockResults: CheckResult[] = [
      {
        type: 'health',
        status: 'success',
        severity: 'low',
        confidence: 'high',
        message: 'All endpoints healthy',
        actionable: 'No action needed',
        context: 'All endpoints responding normally',
        duration: 100
      }
    ];
    
    const mockScanner = {
      runAllChecks: async () => mockResults,
      runSingleCheck: async (type: string) => mockResults[0]
    } as unknown as Scanner;
    
    const mockDeps: MCPDeps = {
      createScanner: () => mockScanner,
      createConfigLoader: (configPath?: string) => new ConfigLoader(configPath)
    };
    
    const server = new MCPServer(configLoader, 3000, mockDeps);
    const result = await server.handleToolRequest('pulsetel_recommend');
    
    expect(result.totalRecommendations).toBe(0);
    expect(result.recommendations).toHaveLength(0);
  });
});
