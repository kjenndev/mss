import { createRegistrationRouter } from './registration.js';
import { decodeImage } from './uploads.js';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { initializeDB, getDb, hashPassword, verifyPassword } from './db.js';
import { getActiveStreams, stopDiscovery, getStreamStats } from './streams.js';
import 'dotenv/config';
import { getMediaLibrary } from './media-library.js';
import { youtubeMetadata, parseYouTubeUrl, youtubeVideoDto, YOUTUBE_LINK_LIMIT } from './youtube.js';
import { featuredUrls, featuredDto, prepareFeatured } from './home-featured.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
function publicArtist(row) {
  const fields = ['id', 'name', 'location', 'description', 'profile_picture', 'cover_photo', 'twitch', 'soundcloud', 'mixcloud', 'youtube', 'slug', 'user_id', 'channel_name', 'created_at', 'updated_at'];
  return Object.fromEntries(fields.filter(key => key in row).map(key => [key, row[key]]));
}
// Fixed-size, fixed-window budgets. At capacity reject new keys rather than evict active limits.
function budget(limit, windowMs, maxKeys = 10000) {
  const entries = new Map();
  return key => {
    const now = Date.now();
    for (const [id, entry] of entries) if (entry.until <= now) entries.delete(id);
    let entry = entries.get(key);
    if (!entry) {
      if (entries.size >= maxKeys) return false;
      entry = { count: 0, until: now + windowMs }; entries.set(key, entry);
    }
    if (entry.count >= limit) return false;
    entry.count++; return true;
  };
}
const commentIpBudget = budget(20, 10 * 60 * 1000);
const commentGlobalBudget = budget(1000, 10 * 60 * 1000, 1);
const loginAccountBudget = budget(10, 15 * 60 * 1000);
const loginIpBudget = budget(30, 15 * 60 * 1000);
const loginGlobalBudget = budget(300, 15 * 60 * 1000, 1);
function publicUser(row) {
  return { ...Object.fromEntries(['id', 'username', 'role', 'artist_id', 'is_disabled', 'display_name'].filter(key => key in row).map(key => [key, row[key]])), profile_picture: row.profile_picture ?? null };
}
const apiPort = process.env.PORT || 4000;
const uploadFolder = process.env.UPLOADS_DIR || path.join(__dirname, 'uploads');
const mediaFolder = path.join(__dirname, 'media');

if (!fs.existsSync(uploadFolder)) {
  fs.mkdirSync(uploadFolder, { recursive: true });
}

if (!fs.existsSync(mediaFolder)) {
  fs.mkdirSync(mediaFolder, { recursive: true });
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 4, parts: 5, fieldSize: 1024 } });
let activeUploads = 0;
const uploadAccountBudget = budget(60, 60 * 60 * 1000);
function boundedUpload(field) {
  const parse = upload.single(field);
  return (req, res, next) => {
    if (activeUploads >= 2 || !uploadAccountBudget(req.user.id)) return res.status(429).json({ error: 'Upload limit reached; try again later' });
    activeUploads++;
    let released = false;
    const release = () => { if (!released) { released = true; activeUploads--; } };
    res.once('finish', release); res.once('close', release);
    parse(req, res, error => { if (error) release(); next(error); });
  };
}
const app = express();
function validationError(req, method, route) {
  for (const [key, value] of Object.entries(req.params || {})) {
    if ((key === 'id' || key === 'imageId') && (!/^[1-9][0-9]*$/.test(String(value)) || !Number.isSafeInteger(Number(value)))) return 'Invalid resource id';
  }
  if (!['post', 'put'].includes(method)) return null;
  const body = req.body;
  if (body !== undefined && (body === null || typeof body !== 'object' || Array.isArray(body))) return 'JSON object required';
  const b = body || {};
  if (route === '/api/auth/me' && (Object.keys(b).some(key => !['username', 'password', 'display_name', 'email_alerts_opt_in'].includes(key)) || (b.email_alerts_opt_in !== undefined && typeof b.email_alerts_opt_in !== 'boolean'))) return 'Invalid profile fields';
  const settingValue = value => value === null || (typeof value === 'string' && value.length <= 10000);
  if (route === '/api/settings/:key' && !settingValue(b.value)) return 'Setting value must be text or null';
  if (route === '/api/settings/batch' && (!Array.isArray(b.settings) || b.settings.length > 100 || b.settings.some(item => !item || typeof item.key !== 'string' || !item.key.trim() || item.key.length > 100 || !settingValue(item.value)) || new Set(b.settings.map(item => item.key)).size !== b.settings.length)) return 'Use up to 100 distinct settings with string keys and text values';
  const strings = { username: 100, display_name: 100, name: 200, title: 200, location: 255, description: 10000, twitch: 255, soundcloud: 255, mixcloud: 255, youtube: 255, slug: 100, channel_name: 100, profile_picture: 255, cover_photo: 255, ticket_link: 255, flyer_artist_name: 255, flyer_artist_url: 255, author_name: 100, content: 5000 };
  for (const [key, max] of Object.entries(strings)) {
    if (b[key] !== undefined && !(b[key] === null && ['cover_photo', 'profile_picture'].includes(key)) && (typeof b[key] !== 'string' || b[key].length > max)) return `Invalid ${key}`;
  }
  for (const key of ['username', 'name', 'title', 'author_name', 'content']) if (b[key] !== undefined && !b[key].trim()) return `${key} must not be empty`;
  if (b.password !== undefined && (typeof b.password !== 'string' || b.password.length > 1024 || (route !== '/api/auth/login' && b.password !== '' && b.password.length < 5))) return 'Password must be 5–1024 characters';
  if (method === 'post' && route === '/api/users' && (!b.password || b.password.length < 5)) return 'Password must be 5–1024 characters';
  if (b.channel_name !== undefined && b.channel_name !== '' && !/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(b.channel_name)) return 'Invalid channel name';
  if (b.date !== undefined && b.date !== null && b.date !== '' && (typeof b.date !== 'string' || b.date.length > 40 || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(b.date) || !Number.isFinite(Date.parse(b.date)))) return 'Invalid event date';
  if (b.role !== undefined && !['admin', 'artist', 'user'].includes(b.role)) return 'Invalid role';
  if (b.is_disabled !== undefined && ![true, false, 0, 1].includes(b.is_disabled)) return 'Invalid disabled flag';
  for (const key of ['artist_id', 'event_id', 'parent_id', 'user_id']) if (b[key] !== undefined && b[key] !== null && b[key] !== '' && (!Number.isSafeInteger(Number(b[key])) || Number(b[key]) < 1 || !['number', 'string'].includes(typeof b[key]))) return `Invalid ${key}`;
  for (const key of ['artist_ids', 'ownedArtistIds']) if (b[key] !== undefined && (!Array.isArray(b[key]) || b[key].length > 100 || b[key].some(id => !Number.isSafeInteger(Number(id)) || Number(id) < 1 || !['number', 'string'].includes(typeof id)) || new Set(b[key].map(Number)).size !== b[key].length)) return `Invalid ${key}: use distinct positive ids (maximum 100)`;
  return null;
}
async function removeUpload(filename) {
  try {
    const db = await getDb();
    await db.transaction(async trx => {
      await trx.raw('SELECT pg_advisory_xact_lock(1297306453)');
      const name = path.basename(filename), url = `/uploads/${name}`;
      for (const [table, column, value] of [
        ['users', 'profile_picture', url], ['events', 'flyer', url], ['artists', 'profile_picture', url], ['artists', 'cover_photo', url],
        ['artist_images', 'filename', name], ['event_images', 'filename', name]
      ]) if (await trx(table).where({ [column]: value }).first()) return;
      // Settings may embed legacy shared media URLs in sanitized rich text.
      const settings = await trx('system_settings').select('value');
      if (settings.some(setting => typeof setting.value === 'string' && setting.value.includes(url))) return;
      try { await fs.promises.unlink(path.join(uploadFolder, name)); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      await trx('uploads').where({ filename: name }).del();
    });
  } catch { console.warn('Upload cleanup deferred: filesystem or database unavailable'); }
}
// Only reconsider accounted uploads referenced by the fields being removed.
// Do not sweep unrelated uploads or legacy files merely mentioned in old content.
async function scheduleRemovedUploadReferences(req, values, embedded = false) {
  const previous = values.filter(value => typeof value === 'string' && value.includes('/uploads/'));
  if (!previous.length) return;
  const uploads = await req.db('uploads').select('filename');
  for (const { filename } of uploads) {
    const url = `/uploads/${filename}`;
    if (previous.some(value => embedded ? value.includes(url) : value === url)) {
      req.afterCommit.push(() => removeUpload(filename));
    }
  }
}
async function atomicHandler(handler, req, res, next, guards = []) {
  const db = req.db || await getDb();
  let status = 200, payload;
  req.afterCommit = [];
  let staged, published;
  if (req.aborted) return res.status(400).json({ error: 'Request aborted' });
  const image = req.file ? await decodeImage(req.file.buffer) : null;
  const buffered = { status(code) { status = code; return this; }, json(value) { payload = value; return this; } };
  const abort = new Error('Response rollback');
  try {
    await db.transaction(async trx => {
      req.db = trx;
      // One lock order for mutations and post-commit media reclamation across workers.
      await trx.raw('SELECT pg_advisory_xact_lock(1297306453)');
      if (req.token) {
        for (const guard of guards) {
          let allowed = false;
          await guard(req, buffered, () => { allowed = true; });
          if (!allowed) throw abort;
        }
      }
      for (const [key, table, owner] of [['artist', 'artists', 'user_id'], ['event', 'events', 'creator_id']]) {
        if (!req[key]) continue;
        const current = await trx(table).where({ id: req[key].id }).forUpdate().first();
        if (!current) { status = 404; payload = { error: 'Resource not found' }; throw abort; }
        if (req.user?.id && req.user.role !== 'admin' && Number(current[owner]) !== Number(req.user.id) && !guards.includes(canUploadEvent)) {
          status = 403; payload = { error: 'Management permission required' }; throw abort;
        }
        req[key] = current;
      }
      const body = req.body || {};
      for (const [table, ids] of [['artists', body.artist_ids], ['artists', body.ownedArtistIds], ['users', body.user_id ? [body.user_id] : []], ['artists', body.artist_id && body.content === undefined ? [body.artist_id] : []]]) {
        if (ids?.length && (await trx(table).whereIn('id', ids.map(Number)).select('id')).length !== ids.length) {
          status = 400; payload = { error: `Unknown ${table} reference` }; throw abort;
        }
      }
      if (image) {
        // The mutation lock above also serializes persistent quota admission.
        const account = await trx('uploads').where({ user_id: req.user.id }).sum('bytes as total').first();
        const all = await trx('uploads').sum('bytes as total').first();
        if (Number(account.total || 0) + image.length > 100 * 1024 * 1024 || Number(all.total || 0) + image.length > 1024 * 1024 * 1024) throw Object.assign(new Error('Upload storage quota exceeded'), { status: 413 });
        req.file.filename = `${uuidv4()}.webp`;
        const staging = path.join(uploadFolder, '.staging');
        await fs.promises.mkdir(staging, { recursive: true });
        staged = path.join(staging, req.file.filename);
        await fs.promises.writeFile(staged, image, { flag: 'wx', mode: 0o600 });
        await trx('uploads').insert({ filename: req.file.filename, user_id: req.user.id, bytes: image.length });
      }
      await handler(req, buffered, next);
      if (req.aborted) { status = 400; payload = { error: 'Request aborted' }; }
      if (status >= 400) throw abort;
      if (staged) {
        published = path.join(uploadFolder, req.file.filename);
        await fs.promises.rename(staged, published);
      }
    });
  } catch (error) {
    for (const filename of [staged, published].filter(Boolean)) await fs.promises.unlink(filename).catch(() => {});
    if (error !== abort) throw error;
  } finally { delete req.db; }
  if (status < 400) for (const cleanup of req.afterCommit) await cleanup();
  return res.status(status).json(payload);
}
// Express 4 does not forward rejected promises. Wrap every route middleware.
for (const method of ['get', 'post', 'put', 'delete']) {
  const register = app[method].bind(app);
  app[method] = (route, ...handlers) => register(route, ...handlers.map((handler, index) =>
    (req, res, next) => Promise.resolve().then(() => {
      const invalid = validationError(req, method, route);
      if (invalid) return res.status(400).json({ error: invalid });
      return method !== 'get' && index === handlers.length - 1 && route !== '/api/auth/login'
        ? atomicHandler(handler, req, res, next, handlers.filter(h => [authMiddleware, adminOnly, canCreateEvent, canManageArtist, canManageEvent, canUploadEvent].includes(h))) : handler(req, res, next); }).catch(next)));
}
const corsOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://localhost:5174').split(',').map(value => value.trim()).filter(Boolean);
for (const origin of corsOrigins) {
  let valid = false;
  try { const parsed = new URL(origin); valid = ['http:', 'https:'].includes(parsed.protocol) && parsed.origin === origin && !origin.includes('*'); } catch {}
  if (!valid) throw new Error('CORS_ORIGINS must contain exact HTTP(S) origins without wildcard, path, or credentials');
}
app.use(cors({ origin: corsOrigins, credentials: true }));
app.use(express.json());
app.use(createRegistrationRouter({ getDb, hashPassword, verifyPassword }));
app.use('/uploads', (req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Content-Security-Policy', "default-src 'none'; sandbox");
  // Preserve old files but never serve active documents or hidden staging paths.
  if (!/^\/[^/.][^/]*\.(?:jpe?g|png|webp|gif)$/i.test(req.path)) return res.status(404).json({ error: 'Image not found' });
  next();
}, express.static(uploadFolder, { dotfiles: 'deny', index: false }));
app.use('/media', express.static(mediaFolder));

await initializeDB();
// Streaming discovery is initialized on demand via getRedis()

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.replace('Bearer ', '');
  const db = req.db || await getDb();
  const session = await db('sessions').where({ token }).first();
  if (!session || !(new Date(session.expires_at).getTime() > Date.now())) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const userQuery = db('users').select('id', 'username', 'role', 'artist_id', 'is_disabled', 'display_name', 'profile_picture', 'email', 'email_verified_at', 'email_alerts_opt_in').where({ id: session.user_id });
  if (req.db) userQuery.forUpdate();
  const user = await userQuery.first();
  // A session may be revoked while this transaction waits for the user lock.
  if (req.db) {
    const currentSession = await db('sessions').where({ token }).forUpdate().first();
    if (!currentSession || Number(currentSession.user_id) !== Number(user?.id) || !(new Date(currentSession.expires_at).getTime() > Date.now())) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }
  
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (user.is_disabled) {
    return res.status(403).json({ error: 'Account is disabled' });
  }

  req.user = user;
  req.token = token;
  next();
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

function canCreateEvent(req, res, next) {
  if (!['artist', 'admin'].includes(req.user.role)) return res.status(403).json({ error: 'Artist or admin access required' });
  next();
}

async function canManageArtist(req, res, next) {
  const artistId = Number(req.params.id);
  const db = req.db || await getDb();
  const artistQuery = db('artists').where({ id: artistId });
  if (req.db) artistQuery.forUpdate();
  const artist = await artistQuery.first();

  if (!artist) {
    return res.status(404).json({ error: 'Artist not found' });
  }

  const userId = req.user.id;
  const isAdmin = req.user.role === 'admin';

  const isOwner = Number(artist.user_id) === Number(userId);
  if (isAdmin || isOwner) {
    req.artist = artist;
    next();
  } else {
    res.status(403).json({ error: 'Ownership required' });
  }
}

async function canManageEvent(req, res, next) {
  const eventId = Number(req.params.id);
  const db = req.db || await getDb();
  const eventQuery = db('events').where({ id: eventId });
  if (req.db) eventQuery.forUpdate();
  const event = await eventQuery.first();

  if (!event) {
    return res.status(404).json({ error: 'Event not found' });
  }

  const isAdmin = req.user.role === 'admin';
  const isCreator = Number(event.creator_id) === Number(req.user.id);

  if (isAdmin || isCreator) {
    req.event = event;
    next();
  } else {
    res.status(403).json({ error: 'Management permission required' });
  }
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || !username.trim() || username.length > 100 || typeof password !== 'string' || !password || password.length > 1024) {
    return res.status(400).json({ error: 'username and password required' });
  }

  const db = req.db || await getDb();
  if (!loginIpBudget(req.ip) || !loginGlobalBudget('global')) return res.status(429).json({ error: 'Too many login attempts; try again later' });
  const result = await db.transaction(async trx => {
    // Lock serializes login with credential resets; stale credentials cannot create a new session.
    const matches = await trx('users').whereRaw('lower(username) = lower(?)', [username]).orderBy('id').limit(2).forUpdate();
    // PostgreSQL lower() can equate Unicode spellings that JavaScript does not.
    // Charge the resolved identity before password work, regardless of alias or IP.
    // Unresolved names retain a separate budget and can never select an identity.
    const accountKey = matches.length === 1 ? `user:${matches[0].id}` : `unresolved:${username.toLowerCase()}`;
    if (!loginAccountBudget(accountKey)) return { status: 429, error: 'Too many login attempts; try again later' };
    // A pre-migration legacy collision must never select an arbitrary identity.
    if (matches.length !== 1) return { status: 401, error: 'Invalid credentials' };
    const user = matches[0];
    if (!user || !(await verifyPassword(password, user.password))) return { status: 401, error: 'Invalid credentials' };
    if (user.is_disabled) return { status: 403, error: 'Account is disabled' };
    if (/^[a-f0-9]{32}$/i.test(user.password)) await trx('users').where({ id: user.id }).update({ password: await hashPassword(password) });
    const token = uuidv4();
    // Keep cleanup within the locked account: another account may hold its session
    // while waiting for this user (for example an admin edit).
    await trx('sessions').where({ user_id: user.id }).where('expires_at', '<', new Date()).del();
    await trx('sessions').insert({ token, user_id: user.id, expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000) });
    return { token, user: publicUser(user) };
  });
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json(result);
});

app.post('/api/auth/logout', authMiddleware, async (req, res) => {
  const db = req.db || await getDb();
  await db('sessions').where({ token: req.token }).del();
  res.json({ success: true });
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  res.json({ user: req.user });
});

// Account portraits are separate from artist gallery images. The shared atomic
// wrapper revalidates auth under the mutation/user/session locks and compensates files.
app.post('/api/auth/me/avatar', authMiddleware, boundedUpload('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Image is required' });
  if (Object.keys(req.body || {}).length) return res.status(400).json({ error: 'Avatar accepts only the image file' });
  const profile_picture = `/uploads/${req.file.filename}`;
  await req.db('users').where({ id: req.user.id }).update({ profile_picture });
  await scheduleRemovedUploadReferences(req, [req.user.profile_picture]);
  res.json({ user: publicUser({ ...req.user, profile_picture }) });
});

app.delete('/api/auth/me/avatar', authMiddleware, async (req, res) => {
  if (Object.keys(req.body || {}).length) return res.status(400).json({ error: 'Avatar removal accepts no fields' });
  await req.db('users').where({ id: req.user.id }).update({ profile_picture: null });
  await scheduleRemovedUploadReferences(req, [req.user.profile_picture]);
  res.json({ user: publicUser({ ...req.user, profile_picture: null }) });
});

app.put('/api/auth/me', authMiddleware, async (req, res) => {
  const { username, password, display_name, email_alerts_opt_in } = req.body || {};
  if (email_alerts_opt_in === true && (!req.user.email || !req.user.email_verified_at)) return res.status(400).json({ error: 'Verify an email address before opting into alerts' });
  const db = req.db || await getDb();

  const updateFields = {
    username: username !== undefined ? username : req.user.username,
    display_name: display_name !== undefined ? display_name : req.user.display_name,
  };

  if (email_alerts_opt_in !== undefined) {
    updateFields.email_alerts_opt_in = email_alerts_opt_in;
    updateFields.email_alerts_updated_at = new Date();
  }
  try {
    if (password) {
      updateFields.password = await hashPassword(password);
    }

    await db('users').where({ id: req.user.id }).forUpdate().first();
    await db('users').where({ id: req.user.id }).update(updateFields);
    if (password || (username !== undefined && username !== req.user.username)) await db('sessions').where({ user_id: req.user.id }).del();

    const updatedUser = await db('users')
      .select('id', 'username', 'role', 'artist_id', 'display_name', 'profile_picture', 'email', 'email_verified_at', 'email_alerts_opt_in')
      .where({ id: req.user.id })
      .first();
      
    res.json({ user: updatedUser });
  } catch (error) {
    if (['23503', '23505', '23514', '22P02', '22007'].includes(error.code)) throw error;
    if (error.message.includes('unique constraint') || error.message.includes('UNIQUE constraint')) {
      res.status(409).json({ error: 'Username is already taken' });
    } else {

      res.status(500).json({ error: 'Unable to update profile' });
    }
  }
});

app.post('/api/users', authMiddleware, adminOnly, async (req, res) => {
  const { username, password, role = 'artist', artist_id, ownedArtistIds, display_name } = req.body || {};
  if (typeof username !== 'string' || !username.trim() || username.length > 100 || typeof password !== 'string' || !password || password.length > 1024) {
    return res.status(400).json({ error: 'username and password are required' });
  }

  const db = req.db || await getDb();
  if (artist_id && !ownedArtistIds?.map(Number).includes(Number(artist_id))) return res.status(400).json({ error: 'Primary artist must be in the owned artist list' });
  try {
    const hashed = await hashPassword(password);
    const [userIdObj] = await db('users').insert({
      username,
      password: hashed,
      role,
      artist_id: artist_id || null,
      display_name: display_name || username
    }).returning('id');
    
    const userId = typeof userIdObj === 'object' ? userIdObj.id : userIdObj;
    if (ownedArtistIds?.length) {
      await db('users').whereIn('artist_id', ownedArtistIds.map(Number)).update({ artist_id: null });
      await db('artists').whereIn('id', ownedArtistIds.map(Number)).update({ user_id: userId });
      await db('users').where({ id: userId }).update({ artist_id: artist_id || null });
    }
    
    const user = await db('users')
      .select('id', 'username', 'role', 'artist_id', 'is_disabled', 'display_name')
      .where({ id: userId })
      .first();

    res.status(201).json({ user });
  } catch (error) {
    if (['23503', '23505', '23514', '22P02', '22007'].includes(error.code)) throw error;
    if (error.message.includes('unique constraint') || error.message.includes('UNIQUE constraint')) {
      res.status(409).json({ error: 'Username is already taken' });
    } else {

      res.status(500).json({ error: 'Unable to create user' });
    }
  }
});

app.get('/api/users', authMiddleware, adminOnly, async (req, res) => {
  const db = req.db || await getDb();
  const users = await db('users')
    .select('id', 'username', 'role', 'artist_id', 'is_disabled', 'display_name')
    .orderBy('username');
  
  const usersWithArtists = await Promise.all(users.map(async (u) => {
    const ownedArtists = await db('artists')
      .select('id', 'name')
      .where({ user_id: u.id });
    
    return { ...u, ownedArtists };
  }));
  
  res.json({ users: usersWithArtists });
});

app.put('/api/users/:id', authMiddleware, adminOnly, async (req, res) => {
  const { username, password, role, artist_id, ownedArtistIds, is_disabled, display_name } = req.body || {};
  const userId = req.params.id;
  const db = req.db || await getDb();
  
  const existingUser = await db('users').where({ id: userId }).forUpdate().first();
  if (!existingUser) {
    return res.status(404).json({ error: 'User not found' });
  }
  if (artist_id) {
    const primary = await db('artists').where({ id: Number(artist_id) }).forUpdate().first();
    const owned = Array.isArray(ownedArtistIds) ? ownedArtistIds.map(Number).includes(Number(artist_id)) : Number(primary?.user_id) === Number(userId);
    if (!owned) return res.status(400).json({ error: 'Primary artist must belong to this user after the ownership update' });
  }

  let finalRole = role !== undefined ? role : existingUser.role;
  if (Number(userId) === req.user.id && role !== undefined && role !== 'admin') {
    finalRole = 'admin';
  }

  const updateFields = {
    username: username !== undefined ? username : existingUser.username,
    role: finalRole,
    artist_id: artist_id !== undefined ? (artist_id || null) : (Array.isArray(ownedArtistIds) && !ownedArtistIds.map(Number).includes(Number(existingUser.artist_id)) ? null : existingUser.artist_id),
    is_disabled: is_disabled !== undefined ? (is_disabled ? 1 : 0) : existingUser.is_disabled,
    display_name: display_name !== undefined ? display_name : existingUser.display_name
  };

  try {
    if (password) {
      updateFields.password = await hashPassword(password);
    }

    await db('users').where({ id: userId }).update(updateFields);
    if (password || updateFields.username !== existingUser.username || Boolean(updateFields.is_disabled) !== Boolean(existingUser.is_disabled) || updateFields.role !== existingUser.role) await db('sessions').where({ user_id: userId }).del();

    if (Array.isArray(ownedArtistIds)) {
      await db('artists').where({ user_id: userId }).update({ user_id: null });
      if (ownedArtistIds.length > 0) {
        await db('users').whereIn('artist_id', ownedArtistIds).whereNot('id', Number(userId)).update({ artist_id: null });
        await db('artists').whereIn('id', ownedArtistIds).update({ user_id: userId });
      }
    }
    
    const updatedUser = await db('users')
      .select('id', 'username', 'role', 'artist_id', 'is_disabled', 'display_name')
      .where({ id: userId })
      .first();

    const ownedArtists = await db('artists')
      .select('id', 'name')
      .where({ user_id: userId });
    
    res.json({ user: { ...updatedUser, ownedArtists } });
  } catch (error) {
    if (['23503', '23505', '23514', '22P02', '22007'].includes(error.code)) throw error;
    if (error.message.includes('unique constraint') || error.message.includes('UNIQUE constraint')) {
      res.status(409).json({ error: 'Username is already taken' });
    } else {

      res.status(500).json({ error: 'Unable to update user' });
    }
  }
});

app.delete('/api/users/:id', authMiddleware, adminOnly, async (req, res) => {
  const userId = req.params.id;
  if (Number(userId) === req.user.id) {
    return res.status(400).json({ error: 'Cannot delete your own admin account' });
  }
  const db = req.db || await getDb();
  // Match standalone authentication and credential resets: user before sessions.
  const deletedUser = await db('users').where({ id: userId }).forUpdate().first();
  await scheduleRemovedUploadReferences(req, [deletedUser?.profile_picture]);
  await db('sessions').where({ user_id: userId }).del();
  await db('users').where({ id: userId }).del();
  res.json({ success: true });
});

app.get('/api/users/me/artists', authMiddleware, async (req, res) => {
  const db = req.db || await getDb();
  const artists = await db('artists')
    .select('id', 'name', 'profile_picture', 'slug')
    .where('user_id', req.user.id)
    .orderBy('name');
  res.json({ artists });
});

app.get('/api/artists', async (req, res) => {
  const db = req.db || await getDb();
  const artists = await db('artists')
    .select('id', 'name', 'location', 'description', 'profile_picture', 'cover_photo', 'twitch', 'soundcloud', 'mixcloud', 'youtube', 'slug', 'user_id', 'channel_name', 'created_at', 'updated_at')
    .orderBy('name');
  res.json({ artists });
});

app.get('/api/artists/:id', async (req, res) => {
  const db = req.db || await getDb();
  const artist = await db('artists')
    .where({ id: req.params.id })
    .first();
    
  if (!artist) {
    return res.status(404).json({ error: 'Artist not found' });
  }
  res.json({ artist: publicArtist(artist) });
});

app.get('/api/artists/:id/manage', authMiddleware, canManageArtist, async (req, res) => {
  res.json({ artist: publicArtist(req.artist) });
});

app.post('/api/artists', authMiddleware, adminOnly, async (req, res) => {
  const { name, location, description, twitch, soundcloud, mixcloud, youtube, cover_photo, slug, user_id, channel_name } = req.body || {};
  if (!name) {
    return res.status(400).json({ error: 'Artist name is required' });
  }

  const db = req.db || await getDb();
  try {
    const [artistIdObj] = await db('artists').insert({
      name,
      location: location || '',
      description: description || '',
      twitch: twitch || '',
      soundcloud: soundcloud || '',
      mixcloud: mixcloud || '',
      youtube: youtube || '',
      cover_photo: cover_photo || null,
      slug: slug || name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
      user_id: user_id || null,
      channel_name: channel_name || ''
    }).returning('id');
    
    const artistId = typeof artistIdObj === 'object' ? artistIdObj.id : artistIdObj;
    const artistQuery = db('artists').where({ id: artistId });
  if (req.db) artistQuery.forUpdate();
  const artist = await artistQuery.first();
    res.status(201).json({ artist: publicArtist(artist) });
  } catch (err) {
    if (['23503', '23505', '23514', '22P02', '22007'].includes(err.code)) throw err;
    if (err.message.includes('unique constraint') || err.message.includes('UNIQUE constraint')) {
      res.status(409).json({ error: 'Slug is already taken' });
    } else {

      res.status(500).json({ error: 'Unable to create artist' });
    }
  }
});

app.put('/api/artists/:id', authMiddleware, canManageArtist, async (req, res) => {
  const update = req.body || {};
  const artist = req.artist;
  if (update.channel_name !== undefined && update.channel_name !== (artist.channel_name || '') && req.user.role !== 'admin') return res.status(403).json({ error: 'Only admins may assign channels' });
  const db = req.db || await getDb();

  const permitted = ['name', 'location', 'description', 'twitch', 'soundcloud', 'mixcloud', 'youtube', 'profile_picture', 'cover_photo', 'slug'];
  if (req.user.role === 'admin') permitted.push('channel_name');
  const updateFields = Object.fromEntries(permitted.filter(key => update[key] !== undefined).map(key => [key, update[key]]));
  updateFields.updated_at = db.fn.now();

  if (req.user.role === 'admin' && update.user_id !== undefined) {
    updateFields.user_id = update.user_id || null;
  }

  try {
    await db('artists').where({ id: artist.id }).update(updateFields);
    await scheduleRemovedUploadReferences(req, ['profile_picture', 'cover_photo']
      .filter(key => updateFields[key] !== undefined && updateFields[key] !== artist[key])
      .map(key => artist[key]));
    if (req.user.role === 'admin' && update.user_id !== undefined && Number(update.user_id || 0) !== Number(artist.user_id || 0)) await db('users').where({ artist_id: artist.id }).whereNot('id', Number(update.user_id || 0)).update({ artist_id: null });
    const updatedArtist = await db('artists').where({ id: artist.id }).first();
    res.json({ artist: publicArtist(updatedArtist) });
  } catch (err) {
    if (['23503', '23505', '23514', '22P02', '22007'].includes(err.code)) throw err;
    if (err.message.includes('unique constraint') || err.message.includes('UNIQUE constraint')) {
      res.status(409).json({ error: 'Slug is already taken' });
    } else {

      res.status(500).json({ error: 'Unable to update artist' });
    }
  }
});

app.delete('/api/artists/:id', authMiddleware, adminOnly, async (req, res) => {
  const db = req.db || await getDb();
  const artist = await db('artists').where({ id: req.params.id }).first();
  if (!artist) {
    return res.status(404).json({ error: 'Artist not found' });
  }
  
  const images = await db('artist_images').where({ artist_id: artist.id });
  for (const img of images) {
    const filePath = path.join(uploadFolder, path.basename(img.filename));
    req.afterCommit.push(() => removeUpload(filePath));
  }

  await scheduleRemovedUploadReferences(req, [artist.profile_picture, artist.cover_photo]);
  await db('artists').where({ id: artist.id }).del();
  await db('artist_images').where({ artist_id: artist.id }).del();
  res.json({ success: true });
});

app.post('/api/artists/:id/upload', authMiddleware, canManageArtist, boundedUpload('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Image is required' });
  }
  const imageUrl = `/uploads/${req.file.filename}`;
  const db = req.db || await getDb();
  await db('artist_images').insert({ artist_id: req.artist.id, filename: req.file.filename, uploader_user_id: req.user.id });
  
  if (!req.artist.profile_picture) {
    await db('artists').where({ id: req.artist.id }).update({ profile_picture: imageUrl });
  }
  
  res.json({ imageUrl, filename: req.file.filename });
});

app.get('/api/artists/:id/images', async (req, res) => {
  const db = req.db || await getDb();
  const images = await db('artist_images')
    .where({ artist_id: req.params.id })
    .orderBy('created_at', 'desc');
  res.json({ images: images.map((image) => ({ id: image.id, url: `/uploads/${image.filename}`, created_at: image.created_at })) });
});

app.get('/api/images', async (req, res) => {
  const db = req.db || await getDb();
  const images = await db('artist_images')
    .orderBy('created_at', 'desc')
    .limit(50);
  res.json({ images: images.map((image) => ({ id: image.id, artist_id: image.artist_id, url: `/uploads/${image.filename}`, created_at: image.created_at })) });
});

app.delete('/api/artists/:id/images/:imageId', authMiddleware, canManageArtist, async (req, res) => {
  const db = req.db || await getDb();
  const image = await db('artist_images')
    .where({ id: req.params.imageId, artist_id: req.artist.id })
    .first();
    
  if (!image) {
    return res.status(404).json({ error: 'Image not found' });
  }
  
  await db('artist_images').where({ id: image.id }).del();
  
  const filePath = path.join(uploadFolder, path.basename(image.filename));
  req.afterCommit.push(() => removeUpload(filePath));
  
  if (req.artist.cover_photo === `/uploads/${image.filename}`) await db('artists').where({ id: req.artist.id }).update({ cover_photo: null });
  if (req.artist.profile_picture === `/uploads/${image.filename}`) {
    const nextImage = await db('artist_images')
      .where({ artist_id: req.artist.id })
      .orderBy('created_at', 'desc')
      .first();
    const nextUrl = nextImage ? `/uploads/${nextImage.filename}` : null;
    await db('artists').where({ id: req.artist.id }).update({ profile_picture: nextUrl });
  }
  res.json({ success: true });
});

app.get('/api/events', async (req, res) => {
  const db = req.db || await getDb();
  const events = await db('events').orderBy('date', 'desc');
  const eventsWithArtists = await Promise.all(events.map(async (event) => {
    const artists = await db('artists as a')
      .join('event_artists as ea', 'a.id', 'ea.artist_id')
      .select('a.id', 'a.name', 'a.profile_picture', 'a.slug')
      .where('ea.event_id', event.id);
    return { ...event, artists };
  }));
  res.json({ events: eventsWithArtists });
});

app.get('/api/events/:id', async (req, res) => {
  const db = req.db || await getDb();
  const event = await db('events').where({ id: req.params.id }).first();
  if (!event) {
    return res.status(404).json({ error: 'Event not found' });
  }
  
  const artists = await db('artists as a')
    .join('event_artists as ea', 'a.id', 'ea.artist_id')
    .select('a.id', 'a.name', 'a.profile_picture', 'a.slug')
    .where('ea.event_id', event.id);
    
  const images = await db('event_images as ei')
    .leftJoin('artists as a', 'ei.artist_id', 'a.id')
    .select('ei.id', 'ei.filename', 'ei.artist_id', 'a.name as artist_name', 'ei.created_at')
    .where('ei.event_id', event.id)
    .orderBy('ei.created_at', 'desc');
    
  res.json({ event: { ...event, artists, images: images.map(img => ({ ...img, url: `/uploads/${img.filename}` })) } });
});

app.post('/api/events', authMiddleware, canCreateEvent, async (req, res) => {
  const { title, description, date, location, ticket_link, artist_ids, flyer_artist_name, flyer_artist_url } = req.body || {};
  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }

  const db = req.db || await getDb();
  try {
    const [eventIdObj] = await db('events').insert({
      title,
      description: description || '',
      date: date || null,
      location: location || '',
      ticket_link: ticket_link || '',
      creator_id: req.user.id,
      flyer_artist_name: flyer_artist_name || '',
      flyer_artist_url: flyer_artist_url || ''
    }).returning('id');
    
    const eventId = typeof eventIdObj === 'object' ? eventIdObj.id : eventIdObj;

    if (Array.isArray(artist_ids) && artist_ids.length > 0) {
      const eventArtists = artist_ids.map(artistId => ({ event_id: eventId, artist_id: artistId }));
      await db('event_artists').insert(eventArtists);
    }

    const eventQuery = db('events').where({ id: eventId });
  if (req.db) eventQuery.forUpdate();
  const event = await eventQuery.first();
    res.status(201).json({ event });
  } catch (err) {
    if (['23503', '23505', '23514', '22P02', '22007'].includes(err.code)) throw err;

    res.status(500).json({ error: 'Unable to create event' });
  }
});

app.put('/api/events/:id', authMiddleware, canManageEvent, async (req, res) => {
  const { title, description, date, location, ticket_link, artist_ids, flyer_artist_name, flyer_artist_url } = req.body || {};
  const db = req.db || await getDb();
  try {
    await db('events').where({ id: req.event.id }).update({
      title: title !== undefined ? title : req.event.title,
      description: description !== undefined ? description : req.event.description,
      date: date !== undefined ? (date || null) : req.event.date,
      location: location !== undefined ? location : req.event.location,
      ticket_link: ticket_link !== undefined ? ticket_link : req.event.ticket_link,
      flyer_artist_name: flyer_artist_name !== undefined ? flyer_artist_name : req.event.flyer_artist_name,
      flyer_artist_url: flyer_artist_url !== undefined ? flyer_artist_url : req.event.flyer_artist_url,
      updated_at: db.fn.now()
    });

    if (Array.isArray(artist_ids)) {
      await db('event_artists').where({ event_id: req.event.id }).del();
      if (artist_ids.length > 0) {
        const eventArtists = artist_ids.map(artistId => ({ event_id: req.event.id, artist_id: artistId }));
        await db('event_artists').insert(eventArtists);
      }
    }

    const updatedEvent = await db('events').where({ id: req.event.id }).first();
    res.json({ event: updatedEvent });
  } catch (err) {
    if (['23503', '23505', '23514', '22P02', '22007'].includes(err.code)) throw err;

    res.status(500).json({ error: 'Unable to update event' });
  }
});

app.delete('/api/events/:id', authMiddleware, canManageEvent, async (req, res) => {
  const db = req.db || await getDb();
  try {
    const images = await db('event_images').where({ event_id: req.event.id });
    for (const img of images) {
      const filePath = path.join(uploadFolder, path.basename(img.filename));
      req.afterCommit.push(() => removeUpload(filePath));
    }
    
    if (req.event.flyer) {
      const flyerPath = path.join(uploadFolder, path.basename(req.event.flyer));
      req.afterCommit.push(() => removeUpload(flyerPath));
    }

    await db('events').where({ id: req.event.id }).del();
    await db('event_artists').where({ event_id: req.event.id }).del();
    await db('event_images').where({ event_id: req.event.id }).del();

    res.json({ success: true });
  } catch (err) {
    if (['23503', '23505', '23514', '22P02', '22007'].includes(err.code)) throw err;

    res.status(500).json({ error: 'Unable to delete event' });
  }
});

app.post('/api/events/:id/flyer', authMiddleware, canManageEvent, boundedUpload('flyer'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Flyer image is required' });
  }
  const flyerUrl = `/uploads/${req.file.filename}`;
  const db = req.db || await getDb();
  const previousFlyer = req.event.flyer;
  await db('events').where({ id: req.event.id }).update({ flyer: flyerUrl });
  if (previousFlyer && previousFlyer !== flyerUrl) req.afterCommit.push(() => removeUpload(previousFlyer));
  res.json({ flyerUrl });
});

async function canUploadEvent(req, res, next) {
  const db = req.db || await getDb();
  const eventQuery = db('events').where({ id: req.params.id });
  if (req.db) eventQuery.forUpdate();
  const event = await eventQuery.first();
  if (!event) return res.status(404).json({ error: 'Event not found' });
  const owned = await db('artists').where({ user_id: req.user.id }).select('id');
  const participant = owned.length && await db('event_artists').where({ event_id: event.id }).whereIn('artist_id', owned.map(a => a.id)).first();
  req.uploadArtistId = participant ? participant.artist_id : (owned.find(a => Number(a.id) === Number(req.user.artist_id))?.id || null);
  if (req.user.role !== 'admin' && Number(event.creator_id) !== Number(req.user.id) && !participant) return res.status(403).json({ error: 'Permission required to upload event images' });
  req.event = event;
  next();
}
app.post('/api/events/:id/images', authMiddleware, canUploadEvent, boundedUpload('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Image is required' });
  const db = req.db || await getDb();
  await db('event_images').insert({ event_id: req.event.id, artist_id: req.uploadArtistId || null, filename: req.file.filename, uploader_user_id: req.user.id });
  res.json({ imageUrl: `/uploads/${req.file.filename}`, filename: req.file.filename });
});

app.get('/api/artists/:id/events', async (req, res) => {
  const db = req.db || await getDb();
  const events = await db('events as e')
    .join('event_artists as ea', 'e.id', 'ea.event_id')
    .select('e.*')
    .where('ea.artist_id', req.params.id)
    .orderBy('e.date', 'desc');
  res.json({ events });
});

app.post('/api/admin/upload', authMiddleware, adminOnly, boundedUpload('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Image is required' });
  }
  const imageUrl = `/uploads/${req.file.filename}`;
  res.json({ imageUrl, filename: req.file.filename });
});

app.get('/api/live/twitch', async (req, res) => {
  const db = req.db || await getDb();
  const artists = await db('artists')
    .select('id', 'name', 'twitch', 'slug')
    .whereNotNull('twitch')
    .whereNot('twitch', '');
    
  const results = artists.map((artist) => {
    return {
      ...artist,
      live: false,
      url: `https://www.twitch.tv/${artist.twitch.trim()}`,
    };
  });
  res.json({ live: results, total: results.length });
});

app.get('/api/streams', async (req, res) => {
  try {
    const streams = await getActiveStreams();
    res.json({ streams });
  } catch (error) {
    if (['23503', '23505', '23514', '22P02', '22007'].includes(error.code)) throw error;
    res.status(500).json({ error: 'Failed to fetch streams' });
  }
});

const featuredAccountBudget = budget(200, 60 * 60 * 1000);
const featuredGlobalBudget = budget(1000, 60 * 60 * 1000, 1);
function featuredProvider(req) {return {get:async url=>{
 if(!featuredAccountBudget(req.user.id) || !featuredGlobalBudget('all')) throw Object.assign(new Error('YouTube lookup limit reached. Try again later.'),{status:429});
 return youtubeMetadata.get(url);
}};}
const featuredLookup = handler => async (req,res,next)=>{
 try {await handler(req,res,next);} catch(error) {
  if(![400,422,429,503].includes(error.status)) throw error;
  res.status(error.status).json({error:error.message,code:error.code});
 }
};
// Homepage curation is separate from the chronologically sorted artist catalog.
app.get('/api/home-featured-videos', async (req, res) => {
 const db=req.db || await getDb();
 res.json({videos:(await db('home_featured_videos').orderBy('position')).map(featuredDto),canAdd:youtubeMetadata.configured()});
});
app.post('/api/home-featured-videos/preview', authMiddleware, adminOnly, featuredLookup(async (req,res,next)=>{
 if(Object.keys(req.body || {}).some(key=>key!=='url')) return res.status(400).json({error:'Only a video URL is accepted.'});
 parseYouTubeUrl(req.body?.url);
 const metadata=await featuredProvider(req).get(req.body.url);
 req.featuredPreview=featuredDto({video_id:metadata.videoId,title:metadata.title,artwork_url:metadata.artworkUrl,duration_seconds:metadata.durationSeconds,published_at:metadata.publishedAt,fetched_at:new Date().toISOString()});
 next();
}), async (req,res)=>res.json({video:req.featuredPreview}));
app.put('/api/home-featured-videos', authMiddleware, adminOnly, featuredLookup(async (req,res,next)=>{
 const parsed=featuredUrls(req.body);
 const db=req.db || await getDb();
 req.featuredRows=await prepareFeatured(parsed,await db('home_featured_videos').select('*'),featuredProvider(req));
 next();
}), async (req,res)=>{
 // Shared atomic wrapper revalidates admin/session after advisory -> user -> session locks.
 await req.db('home_featured_videos').del();
 if(req.featuredRows.length) await req.db('home_featured_videos').insert(req.featuredRows);
 res.json({videos:req.featuredRows.map(featuredDto)});
});

app.get('/api/settings', async (req, res) => {
  const db = req.db || await getDb();
  const settings = await db('system_settings').select('key', 'value', 'description');
  const settingsMap = {};
  settings.forEach(s => {
    settingsMap[s.key] = s.value;
  });
  res.json({ settings: settingsMap, raw: settings });
});

app.put('/api/settings/:key', authMiddleware, adminOnly, async (req, res) => {
  const { value } = req.body || {};

  const db = req.db || await getDb();
  try {
    const previous = await db('system_settings').where({ key: req.params.key }).first();
    await db('system_settings').where({ key: req.params.key }).update({ value, updated_at: db.fn.now() });
    if (previous?.value !== value) await scheduleRemovedUploadReferences(req, [previous?.value], true);

    const updated = await db('system_settings').where({ key: req.params.key }).first();
    res.json({ setting: updated });
  } catch (err) {
    if (['23503', '23505', '23514', '22P02', '22007'].includes(err.code)) throw err;

    res.status(500).json({ error: 'Failed to update setting' });
  }
});

app.post('/api/settings/batch', authMiddleware, adminOnly, async (req, res) => {
  const { settings } = req.body || {}; // array of { key, value }
  if (!Array.isArray(settings)) {
    return res.status(400).json({ error: 'Settings array required' });
  }

  const db = req.db || await getDb();
  try {
    const previous = await db('system_settings').whereIn('key', settings.map(s => s.key)).select('key', 'value');
    await db.transaction(async trx => {
      for (const s of settings) {
        await trx('system_settings')
          .where({ key: s.key })
          .update({ value: s.value, updated_at: trx.fn.now() });
      }
    });
    
    await scheduleRemovedUploadReferences(req, previous
      .filter(old => settings.some(s => s.key === old.key && s.value !== old.value))
      .map(old => old.value), true);
    const updated = await db('system_settings').select('key', 'value');
    const settingsMap = {};
    updated.forEach(s => {
      settingsMap[s.key] = s.value;
    });
    res.json({ settings: settingsMap });
  } catch (err) {
    if (['23503', '23505', '23514', '22P02', '22007'].includes(err.code)) throw err;

    res.status(500).json({ error: 'Failed to update settings' });
  }
});

app.get('/api/admin/stats', authMiddleware, adminOnly, async (req, res) => {
  const db = req.db || await getDb();
  try {
    const artistsCount = await db('artists').count('* as count').first();
    const usersCount = await db('users').count('* as count').first();
    const eventsCount = await db('events').count('* as count').first();
    
    const streamStats = await getStreamStats();
    res.json({ 
        stats: streamStats,
        counts: {
            artists: parseInt(artistsCount.count),
            users: parseInt(usersCount.count),
            events: parseInt(eventsCount.count)
        }
    });
  } catch (error) {
    if (['23503', '23505', '23514', '22P02', '22007'].includes(error.code)) throw error;

    res.status(500).json({ error: 'Failed to fetch server stats' });
  }
});

// One bounded author lookup per page, never one query per comment or private user columns.
async function publicComments(db, rows) {
  const ids = [...new Set(rows.map(row => row.user_id).filter(id => id != null))];
  const authors = ids.length ? await db('users').whereIn('id', ids).select('id', 'profile_picture') : [];
  const pictures = new Map(authors.map(author => [Number(author.id), author.profile_picture ?? null]));
  const fields = ['id', 'content', 'user_id', 'artist_id', 'event_id', 'parent_id', 'author_name', 'created_at', 'updated_at'];
  return rows.map(row => ({
    ...Object.fromEntries(fields.filter(key => key in row).map(key => [key, row[key]])),
    author_profile_picture: pictures.get(Number(row.user_id)) ?? null,
  }));
}

app.get('/api/comments', async (req, res) => {
  const { artist_id, event_id } = req.query;
  const limit = Number(req.query.limit ?? 100), offset = Number(req.query.offset ?? 0);
  if (Boolean(artist_id) === Boolean(event_id) || !/^[1-9][0-9]*$/.test(String(artist_id || event_id)) || !Number.isSafeInteger(Number(artist_id || event_id)) || !Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0) return res.status(400).json({ error: 'One valid target and limit 1–100 / offset >= 0 required' });
  const cursor = req.query.after_id;
  if (cursor !== undefined && (req.query.offset !== undefined || !/^(0|[1-9][0-9]*)$/.test(String(cursor)) || !Number.isSafeInteger(Number(cursor)))) return res.status(400).json({ error: 'Use after_id >= 0 or offset, not both' });
  const db = req.db || await getDb();
  const query = db('comments').where(artist_id ? 'artist_id' : 'event_id', artist_id || event_id).orderBy('id', 'asc').limit(limit + 1);
  if (cursor !== undefined) query.where('id', '>', Number(cursor));
  else query.offset(offset);
  const rows = await query;
  const has_more = rows.length > limit, comments = await publicComments(db, rows.slice(0, limit));
  res.json({ comments, has_more, next_offset: has_more ? offset + limit : null, next_cursor: has_more ? comments.at(-1).id : null });
});

app.post('/api/comments', authMiddleware, async (req, res) => {
  if (!commentIpBudget(req.ip) || !commentGlobalBudget('global')) return res.status(429).json({ error: 'Too many comments; try again later' });
  const { content, artist_id, event_id, parent_id } = req.body || {};
  if (!content) {
    return res.status(400).json({ error: 'Comment content is required' });
  }

  const db = req.db || await getDb();
  try {
    if (Boolean(artist_id) === Boolean(event_id)) return res.status(400).json({ error: 'Exactly one comment target is required' });
    const target = await db(artist_id ? 'artists' : 'events').where({ id: artist_id || event_id }).first();
    if (!target) return res.status(404).json({ error: 'Comment target not found' });
    if (parent_id) {
      const parent = await db('comments').where({ id: parent_id }).first();
      if (!parent || Number(parent.artist_id || 0) !== Number(artist_id || 0) || Number(parent.event_id || 0) !== Number(event_id || 0)) return res.status(400).json({ error: 'Parent must belong to the same discussion' });
    }
    const [commentIdObj] = await db('comments').insert({
      content,
      user_id: req.user.id,
      author_name: req.user.username,
      artist_id: artist_id || null,
      event_id: event_id || null,
      parent_id: parent_id || null,
    }).returning('id');

    const commentId = typeof commentIdObj === 'object' ? commentIdObj.id : commentIdObj;
    const comment = await db('comments').where('id', commentId).first();

    res.status(201).json({ comment: (await publicComments(db, [comment]))[0] });
  } catch (err) {
    if (['23503', '23505', '23514', '22P02', '22007'].includes(err.code)) throw err;

    res.status(500).json({ error: 'Failed to post comment' });
  }
});

app.delete('/api/comments/:id', authMiddleware, async (req, res) => {
  const db = req.db || await getDb();
  try {
    const comment = await db('comments').where({ id: req.params.id }).first();
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    if (req.user.role !== 'admin' && Number(comment.user_id) !== Number(req.user.id)) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    await db('comments').where({ id: req.params.id }).del();
    res.json({ success: true });
  } catch (err) {
    if (['23503', '23505', '23514', '22P02', '22007'].includes(err.code)) throw err;

    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

const youtubeAccountBudget = budget(30, 60 * 60 * 1000);
const youtubeGlobalBudget = budget(1000, 60 * 60 * 1000, 1);
app.get('/api/artists/:id/youtube-videos', async (req, res) => {
  const db = await getDb();
  const artist = await db('artists').where({ id: req.params.id }).first();
  if (!artist) return res.status(404).json({ error: 'Artist not found' });
  const rows = await db('artist_youtube_videos').where({ artist_id: artist.id }).orderBy('published_at', 'desc');
  res.json({ videos: rows.map(row => youtubeVideoDto(row, artist)), configured: youtubeMetadata.configured(), limit: YOUTUBE_LINK_LIMIT });
});
// Initial authorization precedes provider work; atomicHandler then revalidates
// user/session and artist ownership after admission, before any write.
async function prepareYouTubeVideo(req, res, next) {
  if (!req.body || Object.keys(req.body).some(key => !['url', 'refresh'].includes(key)) || (req.body.refresh !== undefined && req.body.refresh !== true)) return res.status(400).json({ error: 'Use url and optional refresh:true only.' });
  try {
    const parsed = parseYouTubeUrl(req.body.url);
    const db = await getDb();
    const existing = await db('artist_youtube_videos').where({ artist_id: req.artist.id, video_id: parsed.videoId }).first();
    if (existing && !req.body.refresh) return res.status(409).json({ error: 'This video is already linked to this artist.' });
    if (!youtubeAccountBudget(req.user.id) || !youtubeGlobalBudget('all')) return res.status(429).json({ error: 'YouTube lookup limit reached. Try again later.' });
    req.youtubeVideo = await youtubeMetadata.get(parsed.url);
    next();
  } catch (error) {
    if (![400, 422, 503].includes(error.status)) throw error;
    return res.status(error.status).json({ error: error.message, code: error.code });
  }
}
app.post('/api/artists/:id/youtube-videos', authMiddleware, canManageArtist, prepareYouTubeVideo, async (req, res) => {
  const video = req.youtubeVideo;
  const where = { artist_id: req.artist.id, video_id: video.videoId };
  const existing = await req.db('artist_youtube_videos').where(where).first();
  if (existing && !req.body.refresh) return res.status(409).json({ error: 'This video is already linked to this artist.' });
  const count = await req.db('artist_youtube_videos').where({ artist_id: req.artist.id }).count().first();
  if (!existing && Number(count.count) >= YOUTUBE_LINK_LIMIT) return res.status(409).json({ error: `An artist can link up to ${YOUTUBE_LINK_LIMIT} YouTube videos. Remove one first.` });
  const fields = { title: video.title, artwork_url: video.artworkUrl, duration_seconds: video.durationSeconds, published_at: video.publishedAt, fetched_at: req.db.fn.now() };
  const [row] = existing
    ? await req.db('artist_youtube_videos').where(where).update(fields).returning('*')
    : await req.db('artist_youtube_videos').insert({ ...where, ...fields }).returning('*');
  res.status(existing ? 200 : 201).json({ video: youtubeVideoDto(row, req.artist) });
});
app.delete('/api/artists/:id/youtube-videos/:videoId', authMiddleware, canManageArtist, async (req, res) => {
  if (!/^[A-Za-z0-9_-]{11}$/.test(req.params.videoId)) return res.status(400).json({ error: 'Invalid YouTube video ID.' });
  await req.db('artist_youtube_videos').where({ artist_id: req.artist.id, video_id: req.params.videoId }).del();
  res.json({ success: true });
});

app.get('/api/media-library', async (req, res) => {
  const query = req.query || {};
  const integer = (value, fallback) => value === undefined ? fallback : typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : NaN;
  const offset = integer(query.offset, 0), limit = integer(query.limit, 50);
  const artistId = integer(query.artistId, undefined);
  if (query.artistId !== undefined && (!Number.isSafeInteger(artistId) || artistId < 1)) return res.status(400).json({ error: 'Use a positive integer artistId' });
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(limit) || limit < 1 || limit > 200) return res.status(400).json({ error: 'Use a nonnegative offset and limit from 1 to 200' });
  const db = req.db || await getDb();
  const artists = await db('artists').select('id', 'name', 'profile_picture', 'soundcloud', 'mixcloud').orderBy('id');
  const videoRows = await db('artist_youtube_videos').select('*').orderBy('artist_id').orderBy('video_id');
  const byId = new Map(artists.map(artist => [artist.id, artist]));
  const videos = videoRows.filter(row => byId.has(row.artist_id)).map(row => youtubeVideoDto(row, byId.get(row.artist_id)));
  res.json(await getMediaLibrary(artists, { offset, limit, artistId, videos }));
});

app.get('/api/feed', async (req, res) => {
  const db = req.db || await getDb();
  const artists = await db('artists')
    .select('id', 'name', 'profile_picture', 'twitch', 'soundcloud', 'mixcloud', 'channel_name')
    .orderBy('updated_at', 'desc')
    .limit(50);
    
  const feed = [];
  for (const artist of artists) {
    if (artist.channel_name) {
      feed.push({
        artistId: artist.id,
        artistName: artist.name,
        artistImage: artist.profile_picture,
        title: `Join ${artist.name} in the Chat`,
        platform: 'Syndicate Live',
        url: `/watch/${artist.channel_name}`, // Frontend will prepend base URL
        createdAt: new Date().toISOString(),
      });
    } else if (artist.twitch) {
      feed.push({
        artistId: artist.id,
        artistName: artist.name,
        artistImage: artist.profile_picture,
        title: `Watch ${artist.name} on Twitch`,
        platform: 'Twitch',
        url: `https://www.twitch.tv/${artist.twitch.trim()}`,
        createdAt: new Date().toISOString(),
      });
    }
    if (artist.soundcloud) {
      feed.push({
        artistId: artist.id,
        artistName: artist.name,
        artistImage: artist.profile_picture,
        title: `Listen to ${artist.name} on SoundCloud`,
        platform: 'SoundCloud',
        url: artist.soundcloud.trim(),
        createdAt: new Date().toISOString(),
      });
    }
    if (artist.mixcloud) {
      feed.push({
        artistId: artist.id,
        artistName: artist.name,
        artistImage: artist.profile_picture,
        title: `Discover ${artist.name} on Mixcloud`,
        platform: 'Mixcloud',
        url: artist.mixcloud.trim(),
        createdAt: new Date().toISOString(),
      });
    }
  }
  res.json({ feed: feed.slice(0, 12) });
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error.code === 'LIMIT_FILE_SIZE' || error.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large' });
  if (error.code?.startsWith('LIMIT_') || error.type === 'entity.parse.failed' || ['22P02', '22007', '23514'].includes(error.code)) return res.status(400).json({ error: 'Invalid request' });
  if (['23505', '23503'].includes(error.code)) return res.status(409).json({ error: 'Conflicting or missing reference' });
  if ([400, 401, 403, 404, 409, 413, 415, 429].includes(error.status)) return res.status(error.status).json({ error: error.message });
  res.status(500).json({ error: 'Internal server error' });
});

const server = app.listen(apiPort, process.env.HOST || '127.0.0.1', () => {
  console.log(`MSS API server running on http://localhost:${apiPort}`);
});

async function shutdown() {
  console.log('\nShutting down server...');
  server.close(async () => {
    await stopDiscovery();
    process.exit(0);
  });
  setTimeout(() => {

    process.exit(1);
  }, 10000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
