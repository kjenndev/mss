import express from 'express';
import { isCanonicalArtistSlug } from './artist-slug.js';

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
 router.get('/artists/:profile', async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  if (!base) return res.status(503).type('text').send('Public sharing origin is not configured.');
  const profile = req.params.profile;
  const numeric = /^[1-9]\d*$/.test(profile) && Number.isSafeInteger(Number(profile));
  const canonical = isCanonicalArtistSlug(profile);
  if (!numeric && !canonical) return res.sendStatus(404);
  try {
   const entity = await loadEntity('artists', numeric ? Number(profile) : profile);
   if (!entity) return res.sendStatus(404);
   if (entity.is_disabled) {
    const index = await loadIndex();
    if (!index.includes('</head>')) throw new Error('Missing web build');
    return res.status(404).type('html').send(index.replace('</head>', '<meta name="robots" content="noindex"></head>'));
   }
   if (!isCanonicalArtistSlug(entity.slug)) return res.sendStatus(404);
   const url = `${base}/artists/${entity.slug}`;
   if (numeric) return res.redirect(308, url);
   if (profile !== entity.slug) return res.sendStatus(404);
   const title = String(entity.name || 'Artist');
   const description = ['Artist on Midnight Sound Syndicate', entity.location].filter(Boolean).join(' · ');
   const artwork = imageUrl(entity.profile_picture, base);
   const image = artwork || `${base}/msslogo.jpg`;
   const imageAlt = artwork ? `${title} artist portrait` : 'Midnight Sound Syndicate logo';
   res.type('html').send(renderIndex(await loadIndex(), `${title} | MSS`, metadata({ title, description, url, image, imageAlt })));
  } catch { res.status(503).type('text').send('Sharing preview is temporarily unavailable.'); }
 });
 router.get('/events/:id', async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  if (!base) return res.status(503).type('text').send('Public sharing origin is not configured.');
  if (!/^[1-9]\d*$/.test(req.params.id) || !Number.isSafeInteger(Number(req.params.id))) return res.sendStatus(404);
  try {
   const entity = await loadEntity('events', Number(req.params.id));
   if (!entity) return res.sendStatus(404);
   const title = String(entity.title || 'Event');
   const date = entity.date && Number.isFinite(new Date(entity.date).getTime()) ? new Date(entity.date).toISOString() : '';
   const description = ['Event on Midnight Sound Syndicate', date, entity.location].filter(Boolean).join(' · ');
   const url = `${base}/events/${req.params.id}`;
   const artwork = imageUrl(entity.flyer, base);
   const imageAlt = `${title} event flyer`;
   const meta = metadata({ title, description, url, image: artwork, imageAlt });
   res.type('html').send(renderIndex(await loadIndex(), `${title} | MSS`, meta));
  } catch { res.status(503).type('text').send('Sharing preview is temporarily unavailable.'); }
 });
 return router;
}
