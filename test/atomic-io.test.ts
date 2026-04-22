import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { atomicWriteFileSync, atomicWriteJsonSync, safeReadJsonSync, safeReadJsonSyncWithDefault } from '../src/atomic-io';

describe('Atomic IO', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'pulsetel-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('atomicWriteFileSync', () => {
    it('should write file atomically', () => {
      const filePath = join(tempDir, 'test.txt');
      atomicWriteFileSync(filePath, 'hello world');
      expect(existsSync(filePath)).toBe(true);
      expect(readFileSync(filePath, 'utf8')).toBe('hello world');
    });

    it('should not leave temp files on success', () => {
      const filePath = join(tempDir, 'test.txt');
      atomicWriteFileSync(filePath, 'hello');
      const files = require('fs').readdirSync(tempDir);
      expect(files).toEqual(['test.txt']);
    });

    it('should handle nested directories', () => {
      const filePath = join(tempDir, 'nested', 'deep', 'test.txt');
      atomicWriteFileSync(filePath, 'nested content');
      expect(existsSync(filePath)).toBe(true);
      expect(readFileSync(filePath, 'utf8')).toBe('nested content');
    });

    it('should overwrite existing file', () => {
      const filePath = join(tempDir, 'test.txt');
      atomicWriteFileSync(filePath, 'first');
      atomicWriteFileSync(filePath, 'second');
      expect(readFileSync(filePath, 'utf8')).toBe('second');
    });
  });

  describe('atomicWriteJsonSync', () => {
    it('should write JSON with pretty printing', () => {
      const filePath = join(tempDir, 'test.json');
      const data = { foo: 'bar', num: 42 };
      atomicWriteJsonSync(filePath, data);
      const content = readFileSync(filePath, 'utf8');
      expect(JSON.parse(content)).toEqual(data);
      expect(content).toContain('\n'); // Pretty printed
    });
  });

  describe('safeReadJsonSync', () => {
    it('should return null for non-existent file', () => {
      const result = safeReadJsonSync(join(tempDir, 'nonexistent.json'));
      expect(result).toBeNull();
    });

    it('should return null for invalid JSON', () => {
      const filePath = join(tempDir, 'bad.json');
      require('fs').writeFileSync(filePath, 'not json');
      const result = safeReadJsonSync(filePath);
      expect(result).toBeNull();
    });

    it('should parse valid JSON', () => {
      const filePath = join(tempDir, 'good.json');
      const data = { test: true };
      require('fs').writeFileSync(filePath, JSON.stringify(data));
      const result = safeReadJsonSync(filePath);
      expect(result).toEqual(data);
    });
  });

  describe('safeReadJsonSyncWithDefault', () => {
    it('should return default value for non-existent file', () => {
      const result = safeReadJsonSyncWithDefault(join(tempDir, 'nonexistent.json'), []);
      expect(result).toEqual([]);
    });

    it('should return parsed data for valid file', () => {
      const filePath = join(tempDir, 'data.json');
      require('fs').writeFileSync(filePath, JSON.stringify([1, 2, 3]));
      const result = safeReadJsonSyncWithDefault(filePath, []);
      expect(result).toEqual([1, 2, 3]);
    });
  });
});
