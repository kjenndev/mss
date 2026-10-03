import sharp from 'sharp';
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
// libvips reports only the default PNG image, even when APNG chunks are present.
// Walk bounded chunk headers, not a substring search that could match compressed pixels.
function isAnimatedPng(buffer) {
  if (!buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return false;
  for (let offset = 8; offset + 12 <= buffer.length;) {
    const length = buffer.readUInt32BE(offset);
    if (length > buffer.length - offset - 12) break; // Decoder rejects malformed data.
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    if (['acTL', 'fcTL', 'fdAT'].includes(type)) return true;
    if (type === 'IEND') break;
    offset += length + 12;
  }
  return false;
}
export async function decodeImage(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length > MAX_IMAGE_BYTES) throw Object.assign(new Error('Image exceeds 5 MiB'), { status: 413 });
  try {
    if (isAnimatedPng(buffer)) throw new Error('Animated PNG is unsupported');
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
