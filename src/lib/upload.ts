import { cropToJpegBlob, type ImageAssessment } from '@/lib/image';

/** Browser-only: crop a file, get a presigned URL, PUT it to R2, return the public URL. */
export async function uploadImage(
  file: File,
): Promise<{ publicUrl: string; assessment: ImageAssessment }> {
  const { blob, assessment } = await cropToJpegBlob(file);

  const presignRes = await fetch('/api/uploads/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contentType: 'image/jpeg' }),
  });
  if (!presignRes.ok) throw new Error(`Could not get upload URL (${presignRes.status})`);
  const { uploadUrl, publicUrl } = (await presignRes.json()) as {
    uploadUrl: string;
    publicUrl: string;
  };

  const put = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/jpeg' },
    body: blob,
  });
  if (!put.ok) throw new Error(`Upload failed (${put.status})`);

  return { publicUrl, assessment };
}
