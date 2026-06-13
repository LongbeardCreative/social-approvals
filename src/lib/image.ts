export const TARGET_W = 1080;
export const TARGET_H = 1350;

export type ImageAssessment = 'ok' | 'cropped' | 'upscaled';

/** Pure: classify a source image by its natural dimensions (ported from legacy processFile). */
export function assess(naturalW: number, naturalH: number): ImageAssessment {
  const ratio = naturalW / naturalH;
  const target = TARGET_W / TARGET_H;
  if (Math.abs(ratio - target) > 0.012) return 'cropped';
  if (naturalW < TARGET_W) return 'upscaled';
  return 'ok';
}

/**
 * Browser-only: cover-fit + center-crop a file to a 1080×1350 JPEG blob (q0.85)
 * on a white background. Mirrors legacy/editor.html processFile().
 */
export async function cropToJpegBlob(
  file: File,
): Promise<{ blob: Blob; assessment: ImageAssessment }> {
  if (!file.type.startsWith('image/')) throw new Error('That file is not an image.');
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = TARGET_W;
    canvas.height = TARGET_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable.');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, TARGET_W, TARGET_H);
    const s = Math.max(TARGET_W / bitmap.width, TARGET_H / bitmap.height);
    const w = bitmap.width * s;
    const h = bitmap.height * s;
    ctx.drawImage(bitmap, (TARGET_W - w) / 2, (TARGET_H - h) / 2, w, h);
    const assessment = assess(bitmap.width, bitmap.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
        'image/jpeg',
        0.85,
      ),
    );
    return { blob, assessment };
  } finally {
    bitmap.close();
  }
}
