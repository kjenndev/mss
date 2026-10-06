import { getImageUrl } from '../../config';
export function sharingData(kind, entity, origin = import.meta.env.VITE_PUBLIC_SITE_ORIGIN) {
 const artist = kind === 'artists';
 let base = '';
 try {
  const u = new URL(origin);
  if (u.protocol === 'https:' && !u.username && !u.password && u.pathname === '/' && !u.search && !u.hash) base = u.origin;
 } catch { /* Sharing requires an explicitly configured public origin. */ }
 const date = !artist && entity.date && Number.isFinite(new Date(entity.date).getTime()) ? new Date(entity.date).toLocaleString() : '';
 return { title: String((artist ? entity.name : entity.title) || (artist ? 'Artist' : 'Event')), kind, image: getImageUrl(artist ? entity.profile_picture : entity.flyer), detail: [date, entity.location].filter(Boolean).join(' · '), url: base && Number.isSafeInteger(Number(entity.id)) && Number(entity.id) > 0 ? `${base}/${kind}/${entity.id}` : '' };
}

export function loadCardImage(source) {
 return new Promise((resolve, reject) => {
  const image = new Image();
  const timer = setTimeout(() => { image.src = ''; reject(new Error('Image load timed out.')); }, 15000);
  image.crossOrigin = 'anonymous';
  image.onload = () => {
   clearTimeout(timer);
   if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 16000000) reject(new Error('Image dimensions are unsupported.'));
   else resolve(image);
  };
  image.onerror = () => { clearTimeout(timer); reject(new Error('Image unavailable or its host does not allow card export.')); };
  image.src = source;
 });
}
function fittedText(ctx, text, x, y, width, size) {
 ctx.font = `600 ${size}px Arial, sans-serif`;
 const chars = Array.from(String(text));
 while (chars.length && ctx.measureText(chars.join('')).width > width) chars.pop();
 const result = chars.join('');
 ctx.fillText(result === String(text) ? result : `${result.slice(0, -1)}…`, x, y);
}
export async function createSharePng(data, { canvas = document.createElement('canvas'), loadImage = loadCardImage } = {}) {
 const image = data.image ? await loadImage(data.image) : null;
 canvas.width = 1080; canvas.height = 1350;
 const ctx = canvas.getContext('2d');
 if (!ctx) throw new Error('Card export is not supported in this browser.');
 ctx.fillStyle = '#171b1e'; ctx.fillRect(0, 0, 1080, 1350);
 ctx.fillStyle = '#eeeeee'; ctx.font = '24px Arial, sans-serif';
 ctx.fillText('MIDNIGHT SOUND SYNDICATE', 48, 72);
 if (image) {
  const scale = Math.min(984 / image.naturalWidth, 1000 / image.naturalHeight);
  const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
  ctx.drawImage(image, (1080 - width) / 2, 150 + (1000 - height) / 2, width, height);
 } else { ctx.fillStyle = '#bbbbbb'; ctx.fillText(data.kind === 'artists' ? 'Artist photo unavailable' : 'Event flyer unavailable', 48, 650); }
 ctx.fillStyle = '#ffffff'; fittedText(ctx, data.title, 48, 1220, 984, 48);
 ctx.fillStyle = '#cccccc'; fittedText(ctx, data.detail || '', 48, 1280, 984, 24);
 if (data.url) fittedText(ctx, data.url, 48, 1320, 984, 20);
 return new Promise((resolve, reject) => {
  try { canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG export failed.')), 'image/png'); }
  catch { reject(new Error('Image host does not allow card export.')); }
 });
}
export function downloadCard(blob, title) {
 const url = URL.createObjectURL(blob);
 const a = document.createElement('a');
 a.href = url;
 a.download = `${Array.from(String(title).normalize('NFC').replace(/[^\p{L}\p{N}_-]+/gu, '-')).slice(0, 80).join('') || 'mss'}-share.png`;
 document.body.appendChild(a); a.click(); a.remove();
 setTimeout(() => URL.revokeObjectURL(url), 60000);
}
