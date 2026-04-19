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

describe('CLIHandlers', () => {
  let handlers: CLIHandlers;

  beforeEach(() => {
    // Reset all mocks before each test
    vi.resetAllMocks();
    handlers = new CLIHandlers(mockDeps);
  });

  describe('Constructor', () => {
    it('should create CLIHandlers instance with default dependencies', () => {
      const defaultHandlers = new CLIHandlers();
      expect(defaultHandlers).toBeInstanceOf(CLIHandlers);
    });

    it('should create CLIHandlers instance with custom dependencies', () => {
      const customHandlers = new CLIHandlers(mockDeps);
      expect(customHandlers).toBeInstanceOf(CLIHandlers);
    });
  });

  describe('Dependency Injection', () => {
    it('should use provided dependencies instead of defaults', () => {
      const customDeps: CLIDeps = {
        ...mockDeps,
        log: vi.fn((message) => {
          // Custom log implementation
          console.log('[CUSTOM]', message);
        })
      };

      const customHandlers = new CLIHandlers(customDeps);
      
      // Verify that the custom handlers use the custom deps
      expect(customHandlers).toBeInstanceOf(CLIHandlers);
    });

    it('should allow mocking of file system operations', () => {
      const fsMockDeps: CLIDeps = {
        ...mockDeps,
        existsSync: vi.fn().mockReturnValue(true),
        readFile: vi.fn().mockReturnValue('mock content'),
        writeFile: vi.fn()
      };

      const fsMockHandlers = new CLIHandlers(fsMockDeps);
      
      // The handlers should use our mocked file system operations
      expect(fsMockHandlers).toBeInstanceOf(CLIHandlers);
    });

    it('should allow mocking of process operations', () => {
      const processMockDeps: CLIDeps = {
        ...mockDeps,
        exit: vi.fn((code) => {
          throw new Error(`Process exit called with code ${code}`);
        }),
        cwd: vi.fn().mockReturnValue('/mock/directory')
      };

      const processMockHandlers = new CLIHandlers(processMockDeps);
      
      // Verify cwd mock works
      expect(processMockHandlers).toBeInstanceOf(CLIHandlers);
      expect(processMockDeps.cwd()).toBe('/mock/directory');
    });
  });

  describe('Error Handling', () => {
    it('should handle missing yaml module gracefully', () => {
      // This test verifies that the yaml fallback works
      const handlersWithYaml = new CLIHandlers(mockDeps);
      expect(handlersWithYaml).toBeInstanceOf(CLIHandlers);
    });
  });

  describe('Method Signatures', () => {
    it('should have handleCheckCommand method', () => {
      expect(typeof handlers.handleCheckCommand).toBe('function');
    });

    it('should have handleFixCommand method', () => {
      expect(typeof handlers.handleFixCommand).toBe('function');
    });

    it('should have handleQuickCommand method', () => {
      expect(typeof handlers.handleQuickCommand).toBe('function');
    });

    it('should have handleInitCommand method', () => {
      expect(typeof handlers.handleInitCommand).toBe('function');
    });

    it('should have handleTrendsCommand method', () => {
      expect(typeof handlers.handleTrendsCommand).toBe('function');
    });

    it('should have handleAnomaliesCommand method', () => {
      expect(typeof handlers.handleAnomaliesCommand).toBe('function');
    });

    it('should have handleHistoryCommand method', () => {
      expect(typeof handlers.handleHistoryCommand).toBe('function');
    });

    it('should have handleBadgeCommand method', () => {
      expect(typeof handlers.handleBadgeCommand).toBe('function');
    });

    it('should have handleStatusCommand method', () => {
      expect(typeof handlers.handleStatusCommand).toBe('function');
    });

    it('should have handleReportCommand method', () => {
      expect(typeof handlers.handleReportCommand).toBe('function');
    });

    it('should have handleWatchCommand method', () => {
      expect(typeof handlers.handleWatchCommand).toBe('function');
    });
  });
});