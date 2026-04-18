import { Scanner, CheckResult } from './scanner';
import { ConfigLoader } from './config';
import { createServer, Server } from 'http';
import { AddressInfo } from 'net';

const VALID_TOOLS = [
  'pulselive_check',
  'pulselive_ci',
  'pulselive_health',
  'pulselive_deps',
  'pulselive_summary'
];

export class MCPServer {
  private configLoader: ConfigLoader;
  private server: Server | null = null;
  private port: number;

  constructor(configLoader: ConfigLoader, port: number = 3000) {
    this.configLoader = configLoader;
    this.port = port;
  }

  private getScanner(dir?: string): Scanner {
    // If a directory is specified, create a fresh ConfigLoader for that path
    if (dir) {
      const dirConfigLoader = new ConfigLoader(dir + '/.pulselive.yml');
      const config = dirConfigLoader.autoDetect();
      return new Scanner(config);
    }
    const config = this.configLoader.autoDetect();
    return new Scanner(config);
  }

  start(): void {
    this.server = createServer(async (req, res) => {
      // Set CORS headers for browser-based integrations
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      try {
        const url = new URL(req.url || '/', `http://${req.headers.host}`);
        const tool = url.searchParams.get('tool');

        if (!tool) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing tool parameter' }));
          return;
        }

        if (!VALID_TOOLS.includes(tool)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Unknown tool: ${tool}. Valid tools: ${VALID_TOOLS.join(', ')}` }));
          return;
        }

        const dir = url.searchParams.get('dir') || undefined;
        const result = await this.handleToolRequest(tool, dir);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    });

    this.server.listen(this.port, () => {
      const address = this.server?.address() as AddressInfo;
      console.log(`MCP Server started on port ${address.port}`);
    });
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  private async handleToolRequest(tool: string, dir?: string): Promise<any> {
    const scanner = this.getScanner(dir);

    switch (tool) {
      case 'pulselive_check':
        return this.pulseliveCheck(scanner);
      case 'pulselive_ci':
        return this.pulseliveCi(scanner);
      case 'pulselive_health':
        return this.pulseliveHealth(scanner);
      case 'pulselive_deps':
        return this.pulseliveDeps(scanner);
      case 'pulselive_summary':
        return this.pulseliveSummary(scanner);
      default:
        throw new Error(`Unknown tool: ${tool}`);
    }
  }

  private async pulseliveCheck(scanner: Scanner): Promise<any> {
    const results = await scanner.runAllChecks();
    return this.formatResults(results);
  }

  private async pulseliveCi(scanner: Scanner): Promise<any> {
    const result = await scanner.runSingleCheck('ci');
    return this.formatSingleResult(result);
  }

  private async pulseliveHealth(scanner: Scanner): Promise<any> {
    const result = await scanner.runSingleCheck('health');
    return this.formatSingleResult(result);
  }

  private async pulseliveDeps(scanner: Scanner): Promise<any> {
    const result = await scanner.runSingleCheck('deps');
    return this.formatSingleResult(result);
  }

  private async pulseliveSummary(scanner: Scanner): Promise<any> {
    const results = await scanner.runAllChecks();
    const criticalCount = results.filter(r => r.status === 'error').length;
    const warningCount = results.filter(r => r.status === 'warning').length;
    
    return {
      critical: criticalCount,
      warnings: warningCount,
      totalChecks: results.length
    };
  }

  private formatResults(results: CheckResult[]): any {
    return results.map(result => ({
      type: result.type,
      status: result.status,
      message: result.message,
      details: result.details
    }));
  }

  private formatSingleResult(result: CheckResult): any {
    return {
      type: result.type,
      status: result.status,
      message: result.message,
      details: result.details
    };
  }
}