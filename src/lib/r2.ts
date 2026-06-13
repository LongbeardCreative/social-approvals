import { S3Client } from '@aws-sdk/client-s3';
import { z } from 'zod';

export const R2_BUCKET = process.env.R2_BUCKET ?? '';
export const R2_PUBLIC_BASE_URL = (process.env.R2_PUBLIC_BASE_URL ?? '').replace(/\/$/, '');

/** True only when every required R2 env var is present. */
export function r2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      R2_BUCKET &&
      R2_PUBLIC_BASE_URL,
  );
}

/**
 * Build the S3 client lazily so importing this module never throws when env is
 * absent (e.g. in unit tests or at build time). R2 is S3-compatible: region is
 * always "auto" and the endpoint is the account-scoped R2 URL.
 */
export function r2Client(): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
    },
  });
}

/** Object key for a normalized upload. Always a `.jpg` under `uploads/`. */
export function newObjectKey(): string {
  return `uploads/${crypto.randomUUID()}.jpg`;
}

/** Request body for POST /api/uploads/presign. We only ever store normalized JPEGs. */
export const PresignBody = z.object({ contentType: z.literal('image/jpeg') });
