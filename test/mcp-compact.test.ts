import { describe, it, expect, vi } from 'vitest';
import { MCPServer } from '../src/mcp-server';
import { ConfigLoader } from '../src/config';
import { CheckResult } from '../src/scanner';

describe('pulsetel_check --compact', () => {
  const createMockScanner = (results: CheckResult[]) => ({
    runAllChecks: vi.fn().mockResolvedValue(results),
    runQuickChecks: vi.fn(),
    runSingleCheck: vi.fn(),
  });

  const createMockDeps = (scannerResults: CheckResult[]) => ({
    createScanner: vi.fn().mockReturnValue(createMockScanner(scannerResults)),
    createConfigLoader: vi.fn().mockReturnValue(new ConfigLoader()),
  });

  it('should return compact output when format=compact', async () => {
    const results: CheckResult[] = [
      { type: 'health', status: 'error', message: 'endpoint failed' },
      { type: 'deps', status: 'warning', message: '2 vulnerabilities' },
      { type: 'git', status: 'success', message: 'ok' }
    ];

    const server = new MCPServer(
      new ConfigLoader(),
      3000,
      createMockDeps(results)
    );

    const result = await server.handleToolRequest('pulsetel_check', process.cwd(), {
      format: 'compact'
    });

    expect(result.compact).toBe(true);
    expect(result.results).toBeDefined();
    expect(result.results).toHaveLength(3);
    
    // Each result should have minimal fields
    const first = result.results[0];
    expect(first.type).toBe('health');
    expect(first.status).toBe('error');
    expect(first.severity).toBe('critical');
    expect(first.message).toBeDefined();
    
    // Should NOT have full enrichment fields that don't exist in compact
    expect(first.duration).toBeUndefined();
    expect(first.confidence).toBeUndefined();
    
    // Summary should still exist
    expect(result.summary).toBeDefined();
    expect(result.summary.critical).toBe(1);
    expect(result.summary.warnings).toBe(1);
    expect(result.summary.passing).toBe(1);
  });

  it('should include actionable field in compact mode', async () => {
    const results: CheckResult[] = [
      { type: 'health', status: 'error', message: 'endpoint failed' }
    ];

    const server = new MCPServer(
      new ConfigLoader(),
      3000,
      createMockDeps(results)
    );

    const result = await server.handleToolRequest('pulsetel_check', process.cwd(), {
      format: 'compact'
    });

    const first = result.results[0];
    expect(first.actionable).toBeDefined();
    expect(typeof first.actionable).toBe('string');
  });

  it('should not include trends in compact mode even when requested', async () => {
    const results: CheckResult[] = [
      { type: 'health', status: 'success', message: 'ok' }
    ];

    const server = new MCPServer(
      new ConfigLoader(),
      3000,
      createMockDeps(results)
    );

    const result = await server.handleToolRequest('pulsetel_check', process.cwd(), {
      format: 'compact',
      includeTrends: true
    });

    expect(result.trends).toBeUndefined();
    expect(result.anomalies).toBeUndefined();
    expect(result.compact).toBe(true);
  });

  it('should return full output when format=summary (default)', async () => {
    const results: CheckResult[] = [
      { type: 'health', status: 'error', message: 'endpoint failed' }
    ];

    const server = new MCPServer(
      new ConfigLoader(),
      3000,
      createMockDeps(results)
    );

    const result = await server.handleToolRequest('pulsetel_check', process.cwd(), {
      format: 'summary'
    });

    expect(result.compact).toBeUndefined();
    const first = result.results[0];
    expect(first.actionable).toBeDefined();
    expect(first.context).toBeDefined();
  });
});
