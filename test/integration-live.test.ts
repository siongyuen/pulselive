import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { existsSync, readFileSync, rmSync } from 'fs';
import path from 'path';

const PULSETEL_BIN = path.resolve(__dirname, '../dist/index.js');
const TEST_PROJECT_DIR = '/tmp/pulsetel-test-project';

describe('PulseTel Live Integration Tests', () => {
  it('should run pulsetel check against real project', () => {
    // Verify test project exists
    expect(existsSync(TEST_PROJECT_DIR)).toBe(true);
    expect(existsSync(path.join(TEST_PROJECT_DIR, 'package.json'))).toBe(true);
    expect(existsSync(path.join(TEST_PROJECT_DIR, '.pulsetel.yml'))).toBe(true);
  });

  it('should detect health endpoint failures', () => {
    const output = execSync(`node ${PULSETEL_BIN} check --json`, {
      cwd: TEST_PROJECT_DIR,
      encoding: 'utf8',
      timeout: 30000,
      env: { ...process.env, GITHUB_TOKEN: '' }
    });

    const result = JSON.parse(output);
    expect(result.schema_version).toBe('1.0.0');
    expect(result.version).toBeDefined();
    expect(result.results).toBeInstanceOf(Array);

    // Find health check result
    const healthResult = result.results.find((r: any) => r.check === 'health');
    expect(healthResult).toBeDefined();
    expect(healthResult.status).toBe('error');
    expect(healthResult.severity).toBe('critical');
    expect(healthResult.message).toContain('failed');
    expect(healthResult.details).toBeInstanceOf(Array);
    expect(healthResult.details.length).toBeGreaterThan(0);

    // Verify endpoint details
    const failingEndpoint = healthResult.details.find((e: any) => e.name === 'Failing Endpoint');
    expect(failingEndpoint).toBeDefined();
    expect(failingEndpoint.status).toBe(400); // Cloudflare blocks external requests
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
    expect(gitResult.status).toBe('success'); // Git status succeeds
    expect(gitResult.details).toBeDefined();
    expect(gitResult.details.uncommitted).toBeGreaterThan(0);
  });

  it('should handle missing GitHub token gracefully', () => {
    const output = execSync(`node ${PULSETEL_BIN} check --json`, {
      cwd: TEST_PROJECT_DIR,
      encoding: 'utf8',
      timeout: 30000,
      env: { ...process.env, GITHUB_TOKEN: '' }
    });

    const result = JSON.parse(output);
    
    // CI check should warn about missing token
    const ciResult = result.results.find((r: any) => r.check === 'ci');
    expect(ciResult).toBeDefined();
    expect(ciResult.status).toBe('warning');
    expect(ciResult.message).toContain('No GitHub token');

    // Issues check should warn about missing token
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
    
    // Verify all results have required fields
    for (const checkResult of result.results) {
      expect(checkResult).toHaveProperty('check');
      expect(checkResult).toHaveProperty('status');
      expect(checkResult).toHaveProperty('severity');
      expect(checkResult).toHaveProperty('confidence');
      expect(checkResult).toHaveProperty('message');
      expect(checkResult).toHaveProperty('actionable');
      expect(checkResult).toHaveProperty('context');
      expect(checkResult).toHaveProperty('duration');
      
      // Status must be one of the allowed values
      expect(['success', 'warning', 'error']).toContain(checkResult.status);
      
      // Severity must be one of the allowed values
      expect(['low', 'medium', 'high', 'critical']).toContain(checkResult.severity);
      
      // Confidence must be one of the allowed values
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
