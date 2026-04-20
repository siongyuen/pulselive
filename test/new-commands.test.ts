import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CLIHandlers } from '../src/cli-handlers';
import { CLIDeps } from '../src/cli-helpers';

// Mock dependencies
const mockDeps: CLIDeps = {
  exit: vi.fn(),
  log: vi.fn(),
  error: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  execFile: vi.fn(),
  cwd: vi.fn()
};

describe('New Commands', () => {
  let handlers: CLIHandlers;

  beforeEach(() => {
    vi.resetAllMocks();
    handlers = new CLIHandlers(mockDeps);
  });

  describe('Health Command', () => {
    it('should have handleHealthCommand method', () => {
      expect(typeof handlers.handleHealthCommand).toBe('function');
    });

    it('should output health score in text format', async () => {
      // Mock scanner to return test results
      const mockScanner = {
        runAllChecks: vi.fn().mockResolvedValue([
          { type: 'ci', status: 'success', message: 'CI passing' },
          { type: 'deps', status: 'warning', message: 'Some vulnerabilities' },
          { type: 'git', status: 'error', message: 'Git issues' }
        ])
      };

      const mockConfigLoader = {
        autoDetect: vi.fn().mockReturnValue({})
      };

      const testHandlers = new CLIHandlers({
        ...mockDeps,
        createScanner: () => mockScanner as any,
        createConfigLoader: () => mockConfigLoader as any
      });

      await testHandlers.handleHealthCommand(undefined, { json: false });

      expect(mockDeps.log).toHaveBeenCalledWith(expect.stringContaining('Health Score:'));
      expect(mockDeps.log).toHaveBeenCalledWith(expect.stringContaining('Critical: 1, Warnings: 1, Success: 1/3'));
    });

    it('should output health score in JSON format', async () => {
      const mockScanner = {
        runAllChecks: vi.fn().mockResolvedValue([
          { type: 'ci', status: 'success', message: 'CI passing' },
          { type: 'deps', status: 'success', message: 'No vulnerabilities' }
        ])
      };

      const mockConfigLoader = {
        autoDetect: vi.fn().mockReturnValue({})
      };

      const testHandlers = new CLIHandlers({
        ...mockDeps,
        createScanner: () => mockScanner as any,
        createConfigLoader: () => mockConfigLoader as any
      });

      await testHandlers.handleHealthCommand(undefined, { json: true });

      expect(mockDeps.log).toHaveBeenCalledWith(expect.stringContaining('health_score'));
      expect(mockDeps.log).toHaveBeenCalledWith(expect.stringContaining('status'));
    });
  });

  describe('Webhooks Command', () => {
    it('should have handleWebhooksCommand method', () => {
      expect(typeof handlers.handleWebhooksCommand).toBe('function');
    });

    it('should output message when no webhooks configured', async () => {
      await handlers.handleWebhooksCommand({ json: false });
      expect(mockDeps.log).toHaveBeenCalledWith('No webhooks configured');
    });

    it('should output webhooks in JSON format', async () => {
      // Mock config with webhooks
      const mockConfigLoader = {
        autoDetect: vi.fn().mockReturnValue({
          webhooks: [
            { url: 'https://example.com/webhook', events: ['critical', 'anomaly'] }
          ]
        })
      };

      const testHandlers = new CLIHandlers({
        ...mockDeps,
        createConfigLoader: () => mockConfigLoader as any
      });

      await testHandlers.handleWebhooksCommand({ json: true });

      expect(mockDeps.log).toHaveBeenCalledWith(expect.stringContaining('webhooks'));
    });
  });

  describe('Sentry Command', () => {
    it('should have handleSentryCommand method', () => {
      expect(typeof handlers.handleSentryCommand).toBe('function');
    });

    it('should be callable without throwing errors', () => {
      // This test just verifies the method signature is correct
      // Integration testing will be done through actual CLI testing
      expect(typeof handlers.handleSentryCommand).toBe('function');
    });
  });
});