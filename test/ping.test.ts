import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CLIHandlers } from '../src/cli-handlers';
import { defaultHandlersDeps } from '../src/cli-handlers';

// Mock dependencies for testing
defaultHandlersDeps.log = vi.fn();
defaultHandlersDeps.exit = vi.fn();
defaultHandlersDeps.cwd = () => '/home/siongyuen/.openclaw/workspace/pulsetel';
defaultHandlersDeps.existsSync = vi.fn();

describe('Ping Command', () => {
  let handlers: CLIHandlers;

  beforeEach(() => {
    handlers = new CLIHandlers(defaultHandlersDeps);
    vi.clearAllMocks();
  });

  describe('handlePingCommand', () => {
    it('should return healthy status when package.json exists', async () => {
      // Mock that package.json exists
      defaultHandlersDeps.existsSync.mockImplementation((path: string) => {
        return path.includes('package.json');
      });

      await handlers.handlePingCommand({});

      expect(defaultHandlersDeps.log).toHaveBeenCalledWith(
        expect.stringContaining('✅ Ping: healthy')
      );
      expect(defaultHandlersDeps.exit).not.toHaveBeenCalled();
    });

    it('should return unhealthy status when package.json does not exist', async () => {
      // Mock that no files exist
      defaultHandlersDeps.existsSync.mockReturnValue(false);

      await handlers.handlePingCommand({});

      expect(defaultHandlersDeps.log).toHaveBeenCalledWith(
        expect.stringContaining('❌ Ping: unhealthy')
      );
      expect(defaultHandlersDeps.exit).toHaveBeenCalledWith(1);
    });

    it('should output JSON when json option is true', async () => {
      // Mock that package.json exists
      defaultHandlersDeps.existsSync.mockImplementation((path: string) => {
        return path.includes('package.json');
      });

      await handlers.handlePingCommand({ json: true });

      const jsonOutput = JSON.parse(defaultHandlersDeps.log.mock.calls[0][0]);
      expect(jsonOutput).toHaveProperty('healthy', true);
      expect(jsonOutput).toHaveProperty('status', 'healthy');
      expect(jsonOutput).toHaveProperty('health_score', 40); // Only package.json
      expect(jsonOutput).toHaveProperty('schema_version', '1.0.0');
    });

    it('should calculate health score correctly', async () => {
      // Mock that all files exist
      defaultHandlersDeps.existsSync.mockReturnValue(true);

      await handlers.handlePingCommand({ json: true });

      const jsonOutput = JSON.parse(defaultHandlersDeps.log.mock.calls[0][0]);
      expect(jsonOutput.health_score).toBe(100); // All checks pass
      expect(jsonOutput.checks).toEqual({
        package_json: true,
        pulsetel_config: true,
        node_modules: true
      });
    });

    it('should handle errors gracefully', async () => {
      // Mock an error
      defaultHandlersDeps.cwd = () => {
        throw new Error('Filesystem error');
      };

      await handlers.handlePingCommand({});

      expect(defaultHandlersDeps.log).toHaveBeenCalledWith(
        '❌ Ping failed:',
        expect.stringContaining('Filesystem error')
      );
      expect(defaultHandlersDeps.exit).toHaveBeenCalledWith(1);
    });

    it('should output JSON error when json option is true and error occurs', async () => {
      // Mock an error
      defaultHandlersDeps.cwd = () => {
        throw new Error('Test error');
      };

      await handlers.handlePingCommand({ json: true });

      const jsonOutput = JSON.parse(defaultHandlersDeps.log.mock.calls[0][0]);
      expect(jsonOutput).toHaveProperty('healthy', false);
      expect(jsonOutput).toHaveProperty('status', 'error');
      expect(jsonOutput).toHaveProperty('error', 'Test error');
    });
  });
});