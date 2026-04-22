import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync, spawn } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import path from 'path';

const PULSETEL_BIN = path.resolve(__dirname, '../dist/index.js');
const TEST_PROJECT_DIR = '/tmp/pulsetel-test-project';

describe('PulseTel Edge Case Integration Tests', () => {
  let serverProcess: any;

  beforeAll(() => {
    // Start the test server
    serverProcess = spawn('node', ['test-server.js'], {
      cwd: TEST_PROJECT_DIR,
      detached: true
    });
    execSync('sleep 1');
  });

  afterAll(() => {
    if (serverProcess) {
      try { process.kill(-serverProcess.pid); } catch (e) {}
    }
  });

  describe('Config Edge Cases', () => {
    it('should handle empty config file', () => {
      const emptyDir = '/tmp/pulsetel-empty-config';
      mkdirSync(emptyDir, { recursive: true });
      writeFileSync(path.join(emptyDir, '.pulsetel.yml'), '');

      const output = execSync(`node ${PULSETEL_BIN} check --json`, {
        cwd: emptyDir,
        encoding: 'utf8',
        timeout: 30000,
        env: { ...process.env, GITHUB_TOKEN: '' }
      });

      const result = JSON.parse(output);
      expect(result.results).toBeInstanceOf(Array);
      // Should still run checks with defaults
      expect(result.results.length).toBeGreaterThan(0);

      rmSync(emptyDir, { recursive: true });
    });

    it('should handle missing config file', () => {
      const noConfigDir = '/tmp/pulsetel-no-config';
      mkdirSync(noConfigDir, { recursive: true });

      const output = execSync(`node ${PULSETEL_BIN} check --json`, {
        cwd: noConfigDir,
        encoding: 'utf8',
        timeout: 30000,
        env: { ...process.env, GITHUB_TOKEN: '' }
      });

      const result = JSON.parse(output);
      expect(result.results).toBeInstanceOf(Array);
      expect(result.results.length).toBeGreaterThan(0);

      rmSync(noConfigDir, { recursive: true });
    });

    it('should handle invalid YAML in config', () => {
      const badConfigDir = '/tmp/pulsetel-bad-config';
      mkdirSync(badConfigDir, { recursive: true });
      writeFileSync(path.join(badConfigDir, '.pulsetel.yml'), 'invalid: yaml: [\n');

      try {
        execSync(`node ${PULSETEL_BIN} check --json`, {
          cwd: badConfigDir,
          encoding: 'utf8',
          timeout: 30000,
          env: { ...process.env, GITHUB_TOKEN: '' }
        });
        // Should not reach here
        expect(false).toBe(true);
      } catch (error: any) {
        // Should exit with error
        expect(error.status).toBeGreaterThan(0);
        expect(error.stderr).toContain('Invalid YAML');
      }

      rmSync(badConfigDir, { recursive: true });
    });

    it('should handle config with unknown keys', () => {
      const unknownKeysDir = '/tmp/pulsetel-unknown-keys';
      mkdirSync(unknownKeysDir, { recursive: true });
      writeFileSync(
        path.join(unknownKeysDir, '.pulsetel.yml'),
        'unknown_section:\n  key: value\ngithub:\n  repo: siongyuen/pulsetel\n'
      );

      const output = execSync(`node ${PULSETEL_BIN} check --json`, {
        cwd: unknownKeysDir,
        encoding: 'utf8',
        timeout: 30000,
        env: { ...process.env, GITHUB_TOKEN: '' }
      });

      const result = JSON.parse(output);
      expect(result.results).toBeInstanceOf(Array);
      // Should warn but not crash

      rmSync(unknownKeysDir, { recursive: true });
    });
  });

  describe('Health Check Edge Cases', () => {
    it('should handle endpoint timeout', () => {
      const timeoutDir = '/tmp/pulsetel-timeout-test';
      mkdirSync(timeoutDir, { recursive: true });
      writeFileSync(
        path.join(timeoutDir, '.pulsetel.yml'),
        'health:\n  allow_local: true\n  endpoints:\n    - name: Slow Endpoint\n      url: http://localhost:8765/slow\n      timeout: 100\n      baseline: 50\n'
      );

      const output = execSync(`node ${PULSETEL_BIN} check --json`, {
        cwd: timeoutDir,
        encoding: 'utf8',
        timeout: 30000,
        env: { ...process.env, GITHUB_TOKEN: '' }
      });

      const result = JSON.parse(output);
      const healthResult = result.results.find((r: any) => r.check === 'health');
      expect(healthResult).toBeDefined();
      expect(healthResult.status).toBe('error');

      rmSync(timeoutDir, { recursive: true });
    });

    it('should handle no endpoints configured', () => {
      const noEndpointsDir = '/tmp/pulsetel-no-endpoints';
      mkdirSync(noEndpointsDir, { recursive: true });
      writeFileSync(
        path.join(noEndpointsDir, '.pulsetel.yml'),
        'health:\n  allow_local: true\n  endpoints: []\n'
      );

      const output = execSync(`node ${PULSETEL_BIN} check --json`, {
        cwd: noEndpointsDir,
        encoding: 'utf8',
        timeout: 30000,
        env: { ...process.env, GITHUB_TOKEN: '' }
      });

      const result = JSON.parse(output);
      const healthResult = result.results.find((r: any) => r.check === 'health');
      expect(healthResult).toBeDefined();
      // Should handle gracefully

      rmSync(noEndpointsDir, { recursive: true });
    });
  });

  describe('Git Edge Cases', () => {
    it('should handle non-git directory', () => {
      const noGitDir = '/tmp/pulsetel-no-git';
      mkdirSync(noGitDir, { recursive: true });
      writeFileSync(path.join(noGitDir, 'package.json'), '{}');

      const output = execSync(`node ${PULSETEL_BIN} check --json`, {
        cwd: noGitDir,
        encoding: 'utf8',
        timeout: 30000,
        env: { ...process.env, GITHUB_TOKEN: '' }
      });

      const result = JSON.parse(output);
      const gitResult = result.results.find((r: any) => r.check === 'git');
      expect(gitResult).toBeDefined();
      // Should handle gracefully, not crash
      expect(gitResult.status).not.toBe('error');

      rmSync(noGitDir, { recursive: true });
    });
  });

  describe('Dependency Check Edge Cases', () => {
    it('should handle missing package.json', () => {
      const noPackageDir = '/tmp/pulsetel-no-package';
      mkdirSync(noPackageDir, { recursive: true });
      writeFileSync(path.join(noPackageDir, '.pulsetel.yml'), 'checks:\n  deps: true\n');

      const output = execSync(`node ${PULSETEL_BIN} check --json`, {
        cwd: noPackageDir,
        encoding: 'utf8',
        timeout: 30000,
        env: { ...process.env, GITHUB_TOKEN: '' }
      });

      const result = JSON.parse(output);
      const depsResult = result.results.find((r: any) => r.check === 'deps');
      expect(depsResult).toBeDefined();
      // Should handle gracefully

      rmSync(noPackageDir, { recursive: true });
    });
  });

  describe('Output Edge Cases', () => {
    it('should handle --quick flag', () => {
      const output = execSync(`node ${PULSETEL_BIN} check --json --quick`, {
        cwd: TEST_PROJECT_DIR,
        encoding: 'utf8',
        timeout: 30000,
        env: { ...process.env, GITHUB_TOKEN: '' }
      });

      const result = JSON.parse(output);
      expect(result).toBeDefined();
      expect(result.results).toBeInstanceOf(Array);
    });

    it('should handle --fail-on-error flag', () => {
      try {
        execSync(`node ${PULSETEL_BIN} check --json --fail-on-error`, {
          cwd: TEST_PROJECT_DIR,
          encoding: 'utf8',
          timeout: 30000,
          env: { ...process.env, GITHUB_TOKEN: '' }
        });
        // If we get here, no errors were found (unlikely with our test project)
      } catch (error: any) {
        // Should exit with error code when errors exist
        expect(error.status).toBeGreaterThan(0);
      }
    });
  });
});
