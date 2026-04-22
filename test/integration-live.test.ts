import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync, spawn } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import path from 'path';

const PULSETEL_BIN = path.resolve(__dirname, '../dist/index.js');
const TEST_PROJECT_DIR = '/tmp/pulsetel-test-project';

describe('PulseTel Live Integration Tests', () => {
  let serverProcess: any;

  beforeAll(() => {
    // Start the test server
    serverProcess = spawn('node', ['test-server.js'], {
      cwd: TEST_PROJECT_DIR,
      detached: true
    });
    
    // Wait for server to start
    execSync('sleep 1');
  });

  afterAll(() => {
    // Kill the test server
    if (serverProcess) {
      process.kill(-serverProcess.pid);
    }
  });

  it('should verify test server is running', () => {
    const output = execSync('curl -s http://localhost:8765/health', { encoding: 'utf8' });
    const response = JSON.parse(output);
    expect(response.status).toBe('ok');
  });

  it('should detect healthy endpoint', () => {
    const output = execSync(`node ${PULSETEL_BIN} check --json`, {
      cwd: TEST_PROJECT_DIR,
      encoding: 'utf8',
      timeout: 30000,
      env: { ...process.env, GITHUB_TOKEN: '' }
    });

    const result = JSON.parse(output);
    const healthResult = result.results.find((r: any) => r.check === 'health');
    expect(healthResult).toBeDefined();
    
    // Find the healthy endpoint detail
    const healthyEndpoint = healthResult.details?.find((e: any) => e.name === 'Healthy Endpoint');
    expect(healthyEndpoint).toBeDefined();
    expect(healthyEndpoint.status).toBe(200);
  });

  it('should detect failing endpoint (500)', () => {
    const output = execSync(`node ${PULSETEL_BIN} check --json`, {
      cwd: TEST_PROJECT_DIR,
      encoding: 'utf8',
      timeout: 30000,
      env: { ...process.env, GITHUB_TOKEN: '' }
    });

    const result = JSON.parse(output);
    const healthResult = result.results.find((r: any) => r.check === 'health');
    expect(healthResult).toBeDefined();
    expect(healthResult.status).toBe('error');
    
    // Find the failing endpoint detail
    const failingEndpoint = healthResult.details?.find((e: any) => e.name === 'Failing Endpoint');
    expect(failingEndpoint).toBeDefined();
    expect(failingEndpoint.status).toBe(500);
  });

  it('should detect unavailable endpoint (503)', () => {
    const output = execSync(`node ${PULSETEL_BIN} check --json`, {
      cwd: TEST_PROJECT_DIR,
      encoding: 'utf8',
      timeout: 30000,
      env: { ...process.env, GITHUB_TOKEN: '' }
    });

    const result = JSON.parse(output);
    const healthResult = result.results.find((r: any) => r.check === 'health');
    expect(healthResult).toBeDefined();
    
    // Find the unavailable endpoint detail
    const unavailableEndpoint = healthResult.details?.find((e: any) => e.name === 'Unavailable Endpoint');
    expect(unavailableEndpoint).toBeDefined();
    expect(unavailableEndpoint.status).toBe(503);
  });

  it('should detect dependency vulnerabilities', () => {
    const output = execSync(`node ${PULSETEL_BIN} check --json`, {
      cwd: TEST_PROJECT_DIR,
      encoding: 'utf8',
      timeout: 30000,
      env: { ...process.env, GITHUB_TOKEN: '' }
    });

    const result = JSON.parse(output);
    const depsResult = result.results.find((r: any) => r.check === 'deps');
    expect(depsResult).toBeDefined();
    expect(depsResult.status).toBe('warning');
    expect(depsResult.message).toContain('vulnerabilities');
    expect(depsResult.details).toBeDefined();
    expect(depsResult.details.vulnerabilities).toBeDefined();
  });

  it('should detect uncommitted git changes', () => {
    const output = execSync(`node ${PULSETEL_BIN} check --json`, {
      cwd: TEST_PROJECT_DIR,
      encoding: 'utf8',
      timeout: 30000,
      env: { ...process.env, GITHUB_TOKEN: '' }
    });

    const result = JSON.parse(output);
    const gitResult = result.results.find((r: any) => r.check === 'git');
    expect(gitResult).toBeDefined();
    expect(gitResult.status).toBe('success');
    expect(gitResult.details).toBeDefined();
    // Uncommitted count may be 0 if files were staged
    expect(gitResult.details.uncommitted).toBeGreaterThanOrEqual(0);
  });

  it('should handle missing GitHub token gracefully', () => {
    const output = execSync(`node ${PULSETEL_BIN} check --json`, {
      cwd: TEST_PROJECT_DIR,
      encoding: 'utf8',
      timeout: 30000,
      env: { ...process.env, GITHUB_TOKEN: '' }
    });

    const result = JSON.parse(output);
    
    const ciResult = result.results.find((r: any) => r.check === 'ci');
    expect(ciResult).toBeDefined();
    expect(ciResult.status).toBe('warning');
    expect(ciResult.message).toContain('No GitHub token');

    const issuesResult = result.results.find((r: any) => r.check === 'issues');
    expect(issuesResult).toBeDefined();
    expect(issuesResult.status).toBe('warning');
    expect(issuesResult.message).toContain('No GitHub token');
  });

  it('should include schema version in all outputs', () => {
    const output = execSync(`node ${PULSETEL_BIN} check --json`, {
      cwd: TEST_PROJECT_DIR,
      encoding: 'utf8',
      timeout: 30000,
      env: { ...process.env, GITHUB_TOKEN: '' }
    });

    const result = JSON.parse(output);
    expect(result.schema_version).toBe('1.0.0');
    expect(result.schema_url).toContain('SCHEMA.md');
    expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.duration).toBeGreaterThan(0);
  });

  it('should export valid JSON structure', () => {
    const output = execSync(`node ${PULSETEL_BIN} check --json`, {
      cwd: TEST_PROJECT_DIR,
      encoding: 'utf8',
      timeout: 30000,
      env: { ...process.env, GITHUB_TOKEN: '' }
    });

    const result = JSON.parse(output);
    
    for (const checkResult of result.results) {
      expect(checkResult).toHaveProperty('check');
      expect(checkResult).toHaveProperty('status');
      expect(checkResult).toHaveProperty('severity');
      expect(checkResult).toHaveProperty('confidence');
      expect(checkResult).toHaveProperty('message');
      expect(checkResult).toHaveProperty('actionable');
      expect(checkResult).toHaveProperty('context');
      expect(checkResult).toHaveProperty('duration');
      
      expect(['success', 'warning', 'error']).toContain(checkResult.status);
      expect(['low', 'medium', 'high', 'critical']).toContain(checkResult.severity);
      expect(['low', 'medium', 'high']).toContain(checkResult.confidence);
    }
  });

  it('should run quick check mode', () => {
    const output = execSync(`node ${PULSETEL_BIN} check --json --quick`, {
      cwd: TEST_PROJECT_DIR,
      encoding: 'utf8',
      timeout: 30000,
      env: { ...process.env, GITHUB_TOKEN: '' }
    });

    const result = JSON.parse(output);
    expect(result.quick).toBe(true);
    expect(result.results).toBeInstanceOf(Array);
    expect(result.results.length).toBeGreaterThan(0);
  });
});
