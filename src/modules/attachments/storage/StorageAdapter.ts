import type { Readable } from 'node:stream';

// One tiny seam between "where bytes live" and everything else. Local disk for dev, any
// S3-compatible endpoint in production, selected by STORAGE_DRIVER (storage/index.ts).
export interface StorageAdapter {
  put(key: string, buffer: Buffer, mimeType: string): Promise<void>;
  getStream(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
}
