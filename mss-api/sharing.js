import express from 'express';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function publicOrigin(value) {
 try {
  const u = new URL(value);
  return u.protocol === 'https:' && !u.username && !u.password && u.pathname === '/' && !u.search && !u.hash ? u.origin : '';
 } catch { return ''; }
}
function imageUrl(value, origin) {
 if (typeof value !== 'string') return '';
 try {
  const url = new URL(value, origin);
  if (url.protocol !== 'https:' || url.username || url.password) return '';
  // Only the exact saved public source. Never fetch/proxy an arbitrary URL.
  if (!value.startsWith('https://')) {
   const decoded = decodeURIComponent(value);
   if (!/^\/uploads\/[^/.][^/\\?#%]*\.(?:jpe?g|png|webp|gif)$/i.test(decoded) || url.pathname !== value || url.search || url.hash) return '';
  }
  return url.href;
 } catch { return ''; }
}
function metadata({ title, description, url, image, imageAlt }) {
 const og = [['og:type', 'website'], ['og:site_name', 'Midnight Sound Syndicate'], ['og:title', title], ['og:description', description], ['og:url', url], ...(image ? [['og:image', image], ['og:image:alt', imageAlt]] : [])];
 const twitter = [['twitter:card', image ? 'summary_large_image' : 'summary'], ['twitter:title', title], ['twitter:description', description], ...(image ? [['twitter:image', image], ['twitter:image:alt', imageAlt]] : [])];
 return `<link rel="canonical" href="${escape(url)}"><meta name="description" content="${escape(description)}">` + og.map(([key, value]) => `<meta property="${key}" content="${escape(value)}">`).join('') + twitter.map(([key, value]) => `<meta name="${key}" content="${escape(value)}">`).join('');
}
function renderIndex(index, title, meta) {
 if (!index.includes('</head>')) throw new Error('Missing web build');
 return index.replace(/<title>[\s\S]*?<\/title>/i, '').replace('</head>', `<title>${escape(title)}</title>${meta}</head>`);
}
export function createSharingRouter({ origin, loadEntity, loadIndex }) {
 const router = express.Router();
 const base = publicOrigin(origin);
 router.get('/', async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  if (!base) return res.status(503).type('text').send('Public sharing origin is not configured.');
  try {
   const title = 'Midnight Sound Syndicate';
   const meta = metadata({ title, description: 'Artists, music and events on Midnight Sound Syndicate.', url: `${base}/`, image: `${base}/msslogo.jpg`, imageAlt: 'Midnight Sound Syndicate logo' });
   res.type('html').send(renderIndex(await loadIndex(), title, meta));
  } catch { res.status(503).type('text').send('Sharing preview is temporarily unavailable.'); }
 });
 for (const kind of ['artists', 'events']) router.get(`/${kind}/:id`, async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  if (!base) return res.status(503).type('text').send('Public sharing origin is not configured.');
  if (!/^[1-9]\d*$/.test(req.params.id) || !Number.isSafeInteger(Number(req.params.id))) return res.sendStatus(404);
  try {
   const entity = await loadEntity(kind, Number(req.params.id));
   if (!entity) return res.sendStatus(404);
   const artist = kind === 'artists';
   if (artist && entity.is_disabled) {
    const index = await loadIndex();
    if (!index.includes('</head>')) throw new Error('Missing web build');
    // Document navigation cannot send localStorage bearer tokens. Keep only the
    // generic app shell so authenticated viewers can resolve the API themselves.
    return res.status(404).type('html').send(index.replace('</head>', '<meta name="robots" content="noindex"></head>'));
   }
   const title = String((artist ? entity.name : entity.title) || (artist ? 'Artist' : 'Event'));
   const date = !artist && entity.date && Number.isFinite(new Date(entity.date).getTime()) ? new Date(entity.date).toISOString() : '';
   const description = [artist ? 'Artist on Midnight Sound Syndicate' : 'Event on Midnight Sound Syndicate', date, entity.location].filter(Boolean).join(' · ');
   const url = `${base}/${kind}/${req.params.id}`;
   const artwork = imageUrl(artist ? entity.profile_picture : entity.flyer, base);
   const image = artwork || (artist ? `${base}/msslogo.jpg` : '');
   const imageAlt = artwork ? (artist ? `${title} artist portrait` : `${title} event flyer`) : 'Midnight Sound Syndicate logo';
   const meta = metadata({ title, description, url, image, imageAlt });
   res.type('html').send(renderIndex(await loadIndex(), `${title} | MSS`, meta));
  } catch { res.status(503).type('text').send('Sharing preview is temporarily unavailable.'); }
 });
 return router;
}
