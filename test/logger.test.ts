import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('Logger', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'pulsetel-log-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should create a logger with default options', async () => {
    const { createLogger } = await import('../src/logger');
    const logger = createLogger();
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.debug).toBe('function');
  });

  it('should log to file when file path provided', async () => {
    const { createLogger } = await import('../src/logger');
    const logFile = join(tempDir, 'app.log');
    const logger = createLogger({ file: logFile, level: 'info' });
    
    logger.info('test message');
    
    // Allow async write to complete
    await new Promise(r => setTimeout(r, 100));
    
    expect(existsSync(logFile)).toBe(true);
    const content = readFileSync(logFile, 'utf8');
    expect(content).toContain('test message');
    expect(content).toContain('"level":20'); // info level
    expect(content).toContain('"levelLabel":"info"');
  });

  it('should respect log level filtering', async () => {
    const { createLogger } = await import('../src/logger');
    const logFile = join(tempDir, 'filtered.log');
    const logger = createLogger({ file: logFile, level: 'warn' });
    
    logger.debug('debug msg');
    logger.info('info msg');
    logger.warn('warn msg');
    logger.error('error msg');
    
    await new Promise(r => setTimeout(r, 100));
    
    const content = readFileSync(logFile, 'utf8');
    expect(content).not.toContain('debug msg');
    expect(content).not.toContain('info msg');
    expect(content).toContain('warn msg');
    expect(content).toContain('error msg');
  });

  it('should include timestamp in log entries', async () => {
    const { createLogger } = await import('../src/logger');
    const logFile = join(tempDir, 'timestamp.log');
    const logger = createLogger({ file: logFile, level: 'info' });
    
    logger.info('timestamp test');
    
    await new Promise(r => setTimeout(r, 100));
    
    const content = readFileSync(logFile, 'utf8');
    const log = JSON.parse(content.trim());
    expect(log.time).toBeDefined();
    expect(typeof log.time).toBe('number');
  });

  it('should include context fields', async () => {
    const { createLogger } = await import('../src/logger');
    const logFile = join(tempDir, 'context.log');
    const logger = createLogger({ file: logFile, level: 'info', name: 'pulsetel' });
    
    logger.info({ checkType: 'ci', duration: 100 }, 'check completed');
    
    await new Promise(r => setTimeout(r, 100));
    
    const content = readFileSync(logFile, 'utf8');
    const log = JSON.parse(content.trim());
    expect(log.checkType).toBe('ci');
    expect(log.duration).toBe(100);
    expect(log.msg).toBe('check completed');
    expect(log.name).toBe('pulsetel');
  });

  it('should handle error objects', async () => {
    const { createLogger } = await import('../src/logger');
    const logFile = join(tempDir, 'error.log');
    const logger = createLogger({ file: logFile, level: 'error' });
    
    const err = new Error('something broke');
    logger.error(err, 'operation failed');
    
    await new Promise(r => setTimeout(r, 100));
    
    const content = readFileSync(logFile, 'utf8');
    const log = JSON.parse(content.trim());
    expect(log.msg).toBe('operation failed');
    expect(log.err).toBeDefined();
    expect(log.err.message).toBe('something broke');
  });

  it('should create child logger with additional context', async () => {
    const { createLogger } = await import('../src/logger');
    const logFile = join(tempDir, 'child.log');
    const logger = createLogger({ file: logFile, level: 'info' });
    const child = logger.child({ requestId: 'req-123' });
    
    child.info('child message');
    
    await new Promise(r => setTimeout(r, 100));
    
    const content = readFileSync(logFile, 'utf8');
    const log = JSON.parse(content.trim());
    expect(log.requestId).toBe('req-123');
    expect(log.msg).toBe('child message');
  });

  it('should default to console-only when no file specified', async () => {
    const { createLogger } = await import('../src/logger');
    const logger = createLogger({ level: 'info' });
    
    // Should not throw when logging without file
    expect(() => logger.info('console only')).not.toThrow();
  });
});
