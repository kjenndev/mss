import sharp from 'sharp';
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export async function decodeImage(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length > MAX_IMAGE_BYTES) throw Object.assign(new Error('Image exceeds 5 MiB'), { status: 413 });
  try {
    const image = sharp(buffer, { limitInputPixels: 16_000_000, failOn: 'warning', animated: false });
    const meta = await image.metadata();
    if (!['jpeg', 'png', 'webp'].includes(meta.format) || (meta.pages || 1) !== 1) throw new Error('Unsupported image');
    const clean = await image.rotate().webp({ quality: 85 }).toBuffer();
    if (clean.length > MAX_IMAGE_BYTES) throw Object.assign(new Error('Image exceeds 5 MiB'), { status: 413 });
    return clean;
  } catch (error) {
    if (error.status === 413) throw error;
    throw Object.assign(new Error('Valid single-frame JPEG, PNG or WebP required (maximum 16 megapixels)'), { status: 415 });
  }
}
