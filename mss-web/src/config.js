// VITE_API_URL accepts an HTTP(S) backend root or its /api endpoint.
// Without it, the deployment must proxy /api and /uploads on this origin.
const configured = (import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '');
export const API_BASE = configured ? (configured.endsWith('/api') ? configured : `${configured}/api`) : '/api';
const assetBase = API_BASE.slice(0, -4);
export function getImageUrl(path) {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  if (!path.startsWith('/') || path.startsWith('//')) return '';
  return `${assetBase}${path}`;
}

export function watchUrl(platform, channel) {
  if (!platform || !channel) return '';
  try {
    const url = new URL(platform);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    return `${platform.replace(/\/+$/, '')}/watch/${encodeURIComponent(channel)}`;
  } catch { return ''; }
}
