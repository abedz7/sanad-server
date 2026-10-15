import { createReadStream } from 'node:fs';
import { access, mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import type { StorageAdapter } from './StorageAdapter.js';

// Keys are server-generated (uuid + canonical extension), so this charset is already guaranteed;
// the check is belt and braces so no future caller can ever turn a key into a path traversal.
const SAFE_KEY = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export class LocalDiskStorage implements StorageAdapter {
  constructor(private readonly dir: string) {}

  // The key is the ONLY path component under the storage dir; anything with a separator, a leading
  // dot or a ".." sequence is rejected outright.
  private pathFor(key: string): string {
    if (!SAFE_KEY.test(key) || key.includes('..')) {
      throw new Error('invalid storage key');
    }
    return join(this.dir, key);
  }

  async put(key: string, buffer: Buffer): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    // 'wx' refuses to overwrite: a key collision (should be impossible with uuids) fails loudly
    // instead of silently replacing someone else's file.
    await writeFile(this.pathFor(key), buffer, { flag: 'wx' });
  }

  async getStream(key: string): Promise<Readable> {
    const filePath = this.pathFor(key);
    await access(filePath); // reject before headers are sent, not mid-stream
    return createReadStream(filePath);
  }

  async delete(key: string): Promise<void> {
    await unlink(this.pathFor(key)).catch((err: unknown) => {
      // Deleting a file that is already gone is not an error.
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    });
  }
}
