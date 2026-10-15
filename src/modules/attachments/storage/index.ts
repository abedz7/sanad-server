import { env } from '../../../config/env.js';
import { LocalDiskStorage } from './LocalDiskStorage.js';
import type { StorageAdapter } from './StorageAdapter.js';

let instance: StorageAdapter | null = null;

// Driver selection by env. The S3 adapter is imported dynamically so the AWS SDK is only loaded
// (and its client only constructed) when STORAGE_DRIVER=s3.
export async function getStorage(): Promise<StorageAdapter> {
  if (instance) return instance;
  if (env.STORAGE_DRIVER === 's3') {
    // env.ts already fails the boot when any of these is missing with STORAGE_DRIVER=s3;
    // this guard keeps the types honest without non-null assertions.
    if (!env.S3_REGION || !env.S3_BUCKET || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
      throw new Error('S3 storage selected but S3_* configuration is incomplete');
    }
    const { S3Storage } = await import('./S3Storage.js');
    instance = new S3Storage({
      region: env.S3_REGION,
      bucket: env.S3_BUCKET,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      endpoint: env.S3_ENDPOINT,
    });
  } else {
    instance = new LocalDiskStorage(env.LOCAL_STORAGE_DIR);
  }
  return instance;
}
