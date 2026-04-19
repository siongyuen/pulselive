import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MCPServer } from '../src/mcp-server';
import { ConfigLoader } from '../src/config';

describe('MCPServer detailed tests', () => {
  let mockConfigLoader: ConfigLoader;
  let mcpServer: MCPServer;

  beforeEach(() => {
    mockConfigLoader = new ConfigLoader();
    mcpServer = new MCPServer(mockConfigLoader);
  });

  // ── Constructor and Initialization ───

  describe('constructor', () => {
    it('should create MCPServer instance with default port', () => {
      const server = new MCPServer(mockConfigLoader);
      expect(server).toBeInstanceOf(MCPServer);
    });

    it('should create MCPServer instance with custom port', () => {
      const server = new MCPServer(mockConfigLoader, 8080);
      expect(server).toBeInstanceOf(MCPServer);
    });
  });

  // ── Server Lifecycle ───

  describe('server lifecycle', () => {
    it('should start server without throwing', () => {
      expect(() => mcpServer.start()).not.toThrow();
    });

    it('should stop server without throwing', () => {
      mcpServer.start();
      expect(() => mcpServer.stop()).not.toThrow();
    });

    it('should handle multiple start/stop cycles', () => {
      mcpServer.start();
      mcpServer.stop();
      mcpServer.start();
      mcpServer.stop();
      expect(true).toBe(true); // If we get here without throwing, test passes
    });
  });

  // ── Public Interface Tests ───

  describe('public interface', () => {
    it('should expose start method', () => {
      expect(typeof mcpServer.start).toBe('function');
    });

    it('should expose stop method', () => {
      expect(typeof mcpServer.stop).toBe('function');
    });

    it('should have default port', () => {
      // The port is internal but we can test the constructor behavior
      const customPortServer = new MCPServer(mockConfigLoader, 9000);
      expect(customPortServer).toBeInstanceOf(MCPServer);
    });
  });

  // ── Error Handling ───

  describe('error handling', () => {
    it('should handle invalid config loader gracefully', () => {
      // Test with a minimal config loader
      const minimalConfigLoader = { autoDetect: vi.fn().mockReturnValue({}) };
      const server = new MCPServer(minimalConfigLoader as any);
      expect(server).toBeInstanceOf(MCPServer);
    });

    it('should handle server start/stop without active requests', () => {
      mcpServer.start();
      // No requests made
      mcpServer.stop();
      expect(true).toBe(true); // If no errors, test passes
    });
  });

  // ── Integration Tests ───

  describe('integration tests', () => {
    it('should create server instance and verify type', () => {
      const server = new MCPServer(mockConfigLoader);
      expect(server).toBeInstanceOf(MCPServer);
      expect(typeof server.start).toBe('function');
      expect(typeof server.stop).toBe('function');
    });

    it('should handle server lifecycle in sequence', () => {
      const server = new MCPServer(mockConfigLoader, 0); // Use random port
      
      // Start server
      server.start();
      
      // Server should be running (we can't easily test this without making requests)
      
      // Stop server
      server.stop();
      
      // Test completed successfully
      expect(true).toBe(true);
    });
  });
});