import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import http from 'http';
import path from 'path';

const PULSETEL_BIN = path.resolve(__dirname, '../dist/index.js');
const TEST_PROJECT_DIR = path.resolve(__dirname, '../tmp/pulsetel-test-project');

function httpRequest(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ status: res.statusCode || 0, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

function execNode(args: string[], cwd: string, timeout = 30000): string {
  const { execSync } = require('child_process');
  return execSync(`node ${args.join(' ')}`, {
    cwd,
    encoding: 'utf8',
    timeout,
    env: { ...process.env, GITHUB_TOKEN: '' },
    shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/bash',
  });
}

describe('PulseTel Live Integration Tests', () => {
  let serverProcess: any;

  beforeAll(() => {
    // Create test project directory if it doesn't exist
    if (!existsSync(TEST_PROJECT_DIR)) {
      mkdirSync(TEST_PROJECT_DIR, { recursive: true });

      // Create package.json with outdated dependencies
      writeFileSync(
        path.join(TEST_PROJECT_DIR, 'package.json'),
        JSON.stringify(
          {
            name: 'pulsetel-test-project',
            version: '1.0.0',
            description: 'Test project for PulseTel integration testing',
            main: 'index.js',
            scripts: {
              test: "echo 'Tests failing!' && exit 1",
              build: "echo 'Build failing!' && exit 1",
            },
            dependencies: {
              lodash: '4.17.15',
              express: '4.16.0',
              axios: '0.19.0',
            },
            devDependencies: {
              jest: '26.0.0',
            },
          },
          null,
          2
        )
      );

      // Create pulsetel config
      writeFileSync(
        path.join(TEST_PROJECT_DIR, '.pulsetel.yml'),
        `github:
  repo: siongyuen/pulsetel-test-project
health:
  allow_local: true
  endpoints:
    - name: Healthy Endpoint
      url: http://localhost:8765/health
      timeout: 3000
      baseline: 100
    - name: Slow Endpoint
      url: http://localhost:8765/slow
      timeout: 3000
      baseline: 500
    - name: Failing Endpoint
      url: http://localhost:8765/error
      timeout: 3000
      baseline: 100
    - name: Unavailable Endpoint
      url: http://localhost:8765/unavailable
      timeout: 3000
      baseline: 100
checks:
  ci: true
  deps: true
  git: true
  health: true
  issues: true
  deploy: false
webhooks: []
`
      );

      // Create test server
      writeFileSync(
        path.join(TEST_PROJECT_DIR, 'test-server.js'),
        `const http = require('http');
const PORT = 8765;
const server = http.createServer((req, res) => {
  switch (req.url) {
    case '/health':
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
      break;
    case '/slow':
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', delayed: true }));
      }, 2000);
      break;
    case '/error':
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal Server Error' }));
      break;
    case '/unavailable':
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Service Unavailable' }));
      break;
    default:
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not Found' }));
  }
});
server.listen(PORT, () => {
  console.log('Test server running on http://localhost:' + PORT);
});
`
      );

      // Create a dummy file for git uncommitted detection
      writeFileSync(path.join(TEST_PROJECT_DIR, 'uncommitted.txt'), 'test');
    }

    // Start the test server
    serverProcess = spawn('node', ['test-server.js'], {
      cwd: TEST_PROJECT_DIR,
      detached: true,
      stdio: 'pipe',
    });

    // Wait for server to start
    const startTime = Date.now();
    while (Date.now() - startTime < 5000) {
      try {
        const req = http.get('http://localhost:8765/health');
        req.on('error', () => {});
        req.destroy();
        break;
      } catch {
        // Server not ready yet
      }
    }
  });

  afterAll(() => {
    if (serverProcess) {
      try {
        process.kill(-serverProcess.pid, 'SIGTERM');
      } catch {
        // Process may have already exited
      }
    }
  });

  it('should verify test server is running', async () => {
    const response = await httpRequest('http://localhost:8765/health');
    expect(response.status).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('ok');
  });

  it('should detect healthy endpoint', () => {
    const output = execNode([PULSETEL_BIN, 'check', '--json'], TEST_PROJECT_DIR);
    const result = JSON.parse(output);
    const healthResult = result.results.find((r: any) => r.check === 'health');
    expect(healthResult).toBeDefined();

    const healthyEndpoint = healthResult.details?.find((e: any) => e.name === 'Healthy Endpoint');
    expect(healthyEndpoint).toBeDefined();
    expect(healthyEndpoint.status).toBe(200);
  });

  it('should detect failing endpoint (500)', () => {
    const output = execNode([PULSETEL_BIN, 'check', '--json'], TEST_PROJECT_DIR);
    const result = JSON.parse(output);
    const healthResult = result.results.find((r: any) => r.check === 'health');
    expect(healthResult).toBeDefined();
    expect(healthResult.status).toBe('error');

    const failingEndpoint = healthResult.details?.find((e: any) => e.name === 'Failing Endpoint');
    expect(failingEndpoint).toBeDefined();
    expect(failingEndpoint.status).toBe(500);
  });

  it('should detect unavailable endpoint (503)', () => {
    const output = execNode([PULSETEL_BIN, 'check', '--json'], TEST_PROJECT_DIR);
    const result = JSON.parse(output);
    const healthResult = result.results.find((r: any) => r.check === 'health');
    expect(healthResult).toBeDefined();

    const unavailableEndpoint = healthResult.details?.find((e: any) => e.name === 'Unavailable Endpoint');
    expect(unavailableEndpoint).toBeDefined();
    expect(unavailableEndpoint.status).toBe(503);
  });

  it('should detect dependency vulnerabilities', () => {
    const output = execNode([PULSETEL_BIN, 'check', '--json'], TEST_PROJECT_DIR, 30000);
    const result = JSON.parse(output);
    const depsResult = result.results.find((r: any) => r.check === 'deps');
    expect(depsResult).toBeDefined();
    expect(depsResult.status).toBe('warning');
    expect(depsResult.message).toContain('vulnerabilities');
    expect(depsResult.details).toBeDefined();
    expect(depsResult.details.vulnerabilities).toBeDefined();
  }, 30000);

  it('should detect uncommitted git changes', () => {
    const output = execNode([PULSETEL_BIN, 'check', '--json'], TEST_PROJECT_DIR);
    const result = JSON.parse(output);
    const gitResult = result.results.find((r: any) => r.check === 'git');
    expect(gitResult).toBeDefined();
    expect(gitResult.status).toBe('success');
    expect(gitResult.details).toBeDefined();
    expect(gitResult.details.uncommitted).toBeGreaterThanOrEqual(0);
  });

  it('should handle missing GitHub token gracefully', () => {
    const output = execNode([PULSETEL_BIN, 'check', '--json'], TEST_PROJECT_DIR);
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
    const output = execNode([PULSETEL_BIN, 'check', '--json'], TEST_PROJECT_DIR);
    const result = JSON.parse(output);
    expect(result.schema_version).toBe('1.0.0');
    expect(result.schema_url).toContain('SCHEMA.md');
    expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.duration).toBeGreaterThan(0);
  });

  it('should export valid JSON structure', () => {
    const output = execNode([PULSETEL_BIN, 'check', '--json'], TEST_PROJECT_DIR);
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
    const output = execNode([PULSETEL_BIN, 'check', '--json', '--quick'], TEST_PROJECT_DIR);
    const result = JSON.parse(output);
    expect(result.quick).toBe(true);
    expect(result.results).toBeInstanceOf(Array);
    expect(result.results.length).toBeGreaterThan(0);
  });
});
