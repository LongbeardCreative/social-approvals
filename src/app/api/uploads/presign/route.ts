import { NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  r2Client,
  r2Configured,
  newObjectKey,
  PresignBody,
  R2_BUCKET,
  R2_PUBLIC_BASE_URL,
} from '@/lib/r2';

export async function POST(request: Request) {
  if (!r2Configured()) {
    return NextResponse.json({ error: 'R2 is not configured' }, { status: 500 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const parsed = PresignBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  const key = newObjectKey();
  const uploadUrl = await getSignedUrl(
    r2Client(),
    new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, ContentType: parsed.data.contentType }),
    { expiresIn: 600 },
  );

  return NextResponse.json({ uploadUrl, publicUrl: `${R2_PUBLIC_BASE_URL}/${key}`, key });
}
