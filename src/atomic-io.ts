import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import crypto from 'crypto';

/**
 * Atomic file operations to prevent race conditions.
 */

/**
 * Write data to a file atomically using write-to-temp-then-rename pattern.
 * This ensures readers always see a complete, valid file.
 */
export function atomicWriteFileSync(filePath: string, data: string | Buffer): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Generate temp file name in same directory (same filesystem = atomic rename)
  const tempFile = `${filePath}.tmp.${crypto.randomBytes(8).toString('hex')}`;

  try {
    writeFileSync(tempFile, data, { encoding: 'utf8' });
    // Atomic rename ensures readers see old or new, never partial
    renameSync(tempFile, filePath);
  } catch (error) {
    // Clean up temp file on failure
    try {
      if (existsSync(tempFile)) {
        unlinkSync(tempFile);
      }
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

/**
 * Write JSON data to file atomically with pretty printing.
 */
export function atomicWriteJsonSync(filePath: string, data: any): void {
  const json = JSON.stringify(data, null, 2);
  atomicWriteFileSync(filePath, json);
}

/**
 * Read and parse JSON from file, returning null on error.
 */
export function safeReadJsonSync(filePath: string): any | null {
  try {
    if (!existsSync(filePath)) {
      return null;
    }
    const content = readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Read and parse JSON from file, returning default value on error.
 */
export function safeReadJsonSyncWithDefault<T>(filePath: string, defaultValue: T): T {
  const data = safeReadJsonSync(filePath);
  return data !== null ? data : defaultValue;
}
