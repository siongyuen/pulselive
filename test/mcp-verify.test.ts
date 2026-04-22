import { describe, it, expect, vi } from 'vitest';
import { MCPServer } from '../src/mcp-server';
import { ConfigLoader } from '../src/config';
import { CheckResult } from '../src/scanner';
import { HistoryEntry } from '../src/trends';

describe('pulsetel_verify', () => {
  const createMockScanner = (results: CheckResult[]) => ({
    runAllChecks: vi.fn().mockResolvedValue(results),
    runQuickChecks: vi.fn(),
    runSingleCheck: vi.fn(),
  });

  const createMockDeps = (scannerResults: CheckResult[]) => ({
    createScanner: vi.fn().mockReturnValue(createMockScanner(scannerResults)),
    createConfigLoader: vi.fn().mockReturnValue(new ConfigLoader()),
  });

  const createHistory = (results: CheckResult[]): HistoryEntry[] => [{
    timestamp: new Date().toISOString(),
    version: '2.4.0',
    duration: 1000,
    results
  }];

  it('should verify and show improvement from previous run', async () => {
    const previousResults: CheckResult[] = [
      { type: 'health', status: 'error', message: 'endpoint failed' },
      { type: 'deps', status: 'success', message: 'ok' }
    ];

    const currentResults: CheckResult[] = [
      { type: 'health', status: 'success', message: 'endpoint ok' },
      { type: 'deps', status: 'success', message: 'ok' }
    ];

    const server = new MCPServer(
      new ConfigLoader(),
      3000,
      createMockDeps(currentResults)
    );

    const result = await server.handleToolRequest('pulsetel_verify', process.cwd(), {
      includeTrends: false,
      history: createHistory(previousResults)
    });

    expect(result.current).toBeDefined();
    expect(result.delta).toBeDefined();
    expect(result.delta.improved).toHaveLength(1);
    expect(result.delta.improved[0].type).toBe('health');
    expect(result.delta.improved[0].from).toBe('error');
    expect(result.delta.improved[0].to).toBe('success');
    expect(result.delta.worsened).toHaveLength(0);
    expect(result.recommendations).toContain('improved');
  });

  it('should verify and show worsening from previous run', async () => {
    const previousResults: CheckResult[] = [
      { type: 'health', status: 'success', message: 'endpoint ok' },
      { type: 'deps', status: 'success', message: 'ok' }
    ];

    const currentResults: CheckResult[] = [
      { type: 'health', status: 'success', message: 'endpoint ok' },
      { type: 'deps', status: 'warning', message: '2 vulnerabilities' }
    ];

    const server = new MCPServer(
      new ConfigLoader(),
      3000,
      createMockDeps(currentResults)
    );

    const result = await server.handleToolRequest('pulsetel_verify', process.cwd(), {
      includeTrends: false,
      history: createHistory(previousResults)
    });

    expect(result.delta.worsened).toHaveLength(1);
    expect(result.delta.worsened[0].type).toBe('deps');
    expect(result.delta.worsened[0].from).toBe('success');
    expect(result.delta.worsened[0].to).toBe('warning');
    expect(result.recommendations).toContain('worsened');
  });

  it('should handle no previous history', async () => {
    const currentResults: CheckResult[] = [
      { type: 'health', status: 'success', message: 'endpoint ok' }
    ];

    const server = new MCPServer(
      new ConfigLoader(),
      3000,
      createMockDeps(currentResults)
    );

    const result = await server.handleToolRequest('pulsetel_verify', process.cwd());

    expect(result.previous_check).toBeNull();
    expect(result.delta.unchanged).toHaveLength(1);
    expect(result.delta.unchanged[0].message).toContain('New check');
    expect(result.recommendations).toBe('✓ No change');
  });

  it('should include schema version and timestamp', async () => {
    const currentResults: CheckResult[] = [
      { type: 'health', status: 'success', message: 'ok' }
    ];

    const server = new MCPServer(
      new ConfigLoader(),
      3000,
      createMockDeps(currentResults)
    );

    const result = await server.handleToolRequest('pulsetel_verify', process.cwd());

    expect(result.schema_version).toBe('1.0.0');
    expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });
});
