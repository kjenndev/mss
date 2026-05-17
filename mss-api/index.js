import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { initializeDB, getDb, hashPassword } from './db.js';
import { startRtmpServer, getActiveStreams, stopRtmpServer, getRtmpStats } from './rtmp.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiPort = process.env.PORT || 4000;
const uploadFolder = path.join(__dirname, 'uploads');
const mediaFolder = path.join(__dirname, 'media');

if (!fs.existsSync(uploadFolder)) {
  fs.mkdirSync(uploadFolder, { recursive: true });
}

if (!fs.existsSync(mediaFolder)) {
  fs.mkdirSync(mediaFolder, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadFolder),
  filename: (req, file, cb) => {
    const safeName = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9_.-]/g, '-')}`;
    cb(null, safeName);
  },
});

const upload = multer({ storage });
const app = express();
app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:5174'], credentials: true }));
app.use(express.json());
app.use('/uploads', express.static(uploadFolder));
app.use('/media', express.static(mediaFolder, {
    setHeaders: (res) => {
        res.set('Access-Control-Allow-Origin', '*');
    }
}));

await initializeDB();
await startRtmpServer();

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.replace('Bearer ', '');
  const db = await getDb();
  const session = await db.get('SELECT * FROM sessions WHERE token = ?', token);
  if (!session) {
    await db.close();
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const user = await db.get('SELECT id, username, role, artist_id, is_disabled FROM users WHERE id = ?', session.user_id);
  await db.close();
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

async function canManageArtist(req, res, next) {
  const artistId = Number(req.params.id);
  const db = await getDb();
  const artist = await db.get('SELECT * FROM artists WHERE id = ?', artistId);
  await db.close();

  if (!artist) {
    return res.status(404).json({ error: 'Artist not found' });
  }

  const userId = req.user.id;
  const userArtistId = req.user.artist_id;
  const isAdmin = req.user.role === 'admin';

  const isOwner = Number(artist.user_id) === Number(userId);
  const isTheArtist = userArtistId !== null && Number(userArtistId) === Number(artist.id);

  if (isAdmin || isOwner || isTheArtist) {
    req.artist = artist;
    next();
  } else {
    res.status(403).json({ error: 'Ownership required' });
  }
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password required' });
  }

  const db = await getDb();
  const passwordHash = hashPassword(password);
  const user = await db.get('SELECT id, username, role, artist_id, is_disabled FROM users WHERE username = ? AND password = ?', username, passwordHash);
  if (!user) {
    await db.close();
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  if (user.is_disabled) {
    await db.close();
    return res.status(403).json({ error: 'Account is disabled' });
  }

  const token = uuidv4();
  await db.run('INSERT INTO sessions (token, user_id) VALUES (?, ?)', token, user.id);
  await db.close();

  res.json({ token, user });
});

app.post('/api/auth/logout', authMiddleware, async (req, res) => {
  const db = await getDb();
  await db.run('DELETE FROM sessions WHERE token = ?', req.token);
  await db.close();
  res.json({ success: true });
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  res.json({ user: req.user });
});

app.put('/api/auth/me', authMiddleware, async (req, res) => {
  const { username, password } = req.body || {};
  const db = await getDb();

  const updateFields = {
    username: username !== undefined ? username : req.user.username,
  };

  try {
    if (password) {
      const hashed = hashPassword(password);
      await db.run(
        'UPDATE users SET username = ?, password = ? WHERE id = ?',
        updateFields.username,
        hashed,
        req.user.id
      );
    } else {
      await db.run(
        'UPDATE users SET username = ? WHERE id = ?',
        updateFields.username,
        req.user.id
      );
    }

    const updatedUser = await db.get('SELECT id, username, role, artist_id FROM users WHERE id = ?', req.user.id);
    res.json({ user: updatedUser });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      res.status(409).json({ error: 'Username is already taken' });
    } else {
      res.status(500).json({ error: 'Unable to update profile' });
    }
  } finally {
    await db.close();
  }
});

app.post('/api/users', authMiddleware, adminOnly, async (req, res) => {
  const { username, password, role = 'artist', artist_id } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }

  const db = await getDb();
  try {
    const hashed = hashPassword(password);
    const result = await db.run(
      'INSERT INTO users (username, password, role, artist_id) VALUES (?, ?, ?, ?)',
      username,
      hashed,
      role,
      artist_id || null,
    );
    const user = await db.get('SELECT id, username, role, artist_id, is_disabled FROM users WHERE id = ?', result.lastID);
    res.status(201).json({ user });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      res.status(409).json({ error: 'Username is already taken' });
    } else {
      res.status(500).json({ error: 'Unable to create user' });
    }
  } finally {
    await db.close();
  }
});

app.get('/api/users', authMiddleware, adminOnly, async (req, res) => {
  const db = await getDb();
  const users = await db.all('SELECT id, username, role, artist_id, is_disabled FROM users ORDER BY username');
  
  const usersWithArtists = await Promise.all(users.map(async (u) => {
    const ownedByUserId = await db.all('SELECT id, name FROM artists WHERE user_id = ?', u.id);
    const ownedArtists = [...ownedByUserId];
    
    if (u.artist_id) {
      const primaryArtist = await db.get('SELECT id, name FROM artists WHERE id = ?', u.artist_id);
      if (primaryArtist && !ownedArtists.find(a => a.id === primaryArtist.id)) {
        ownedArtists.push(primaryArtist);
      }
    }
    
    return { ...u, ownedArtists };
  }));

  await db.close();
  res.json({ users: usersWithArtists });
});

app.put('/api/users/:id', authMiddleware, adminOnly, async (req, res) => {
  const { username, password, role, artist_id, ownedArtistIds, is_disabled } = req.body || {};
  const userId = req.params.id;

  const db = await getDb();
  const existingUser = await db.get('SELECT * FROM users WHERE id = ?', userId);
  
  if (!existingUser) {
    await db.close();
    return res.status(404).json({ error: 'User not found' });
  }

  let finalRole = role !== undefined ? role : existingUser.role;
  if (Number(userId) === req.user.id && role !== undefined && role !== 'admin') {
    finalRole = 'admin';
  }

  const updateFields = {
    username: username !== undefined ? username : existingUser.username,
    role: finalRole,
    artist_id: artist_id !== undefined ? (artist_id || null) : existingUser.artist_id,
    is_disabled: is_disabled !== undefined ? (is_disabled ? 1 : 0) : existingUser.is_disabled
  };

  try {
    if (password) {
      const hashed = hashPassword(password);
      await db.run(
        'UPDATE users SET username = ?, password = ?, role = ?, artist_id = ?, is_disabled = ? WHERE id = ?',
        updateFields.username,
        hashed,
        updateFields.role,
        updateFields.artist_id,
        updateFields.is_disabled,
        userId
      );
    } else {
      await db.run(
        'UPDATE users SET username = ?, role = ?, artist_id = ?, is_disabled = ? WHERE id = ?',
        updateFields.username,
        updateFields.role,
        updateFields.artist_id,
        updateFields.is_disabled,
        userId
      );
    }

    if (Array.isArray(ownedArtistIds)) {
      await db.run('UPDATE artists SET user_id = NULL WHERE user_id = ?', userId);
      if (ownedArtistIds.length > 0) {
        const placeholders = ownedArtistIds.map(() => '?').join(',');
        await db.run(`UPDATE artists SET user_id = ? WHERE id IN (${placeholders})`, userId, ...ownedArtistIds);
      }
    }
    
    const updatedUser = await db.get('SELECT id, username, role, artist_id, is_disabled FROM users WHERE id = ?', userId);
    const ownedArtists = await db.all('SELECT id, name FROM artists WHERE user_id = ?', userId);
    
    res.json({ user: { ...updatedUser, ownedArtists } });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      res.status(409).json({ error: 'Username is already taken' });
    } else {
      console.error('Update User Error:', error);
      res.status(500).json({ error: 'Unable to update user' });
    }
  } finally {
    await db.close();
  }
});

app.delete('/api/users/:id', authMiddleware, adminOnly, async (req, res) => {
  const userId = req.params.id;
  if (Number(userId) === req.user.id) {
    return res.status(400).json({ error: 'Cannot delete your own admin account' });
  }
  const db = await getDb();
  await db.run('DELETE FROM users WHERE id = ?', userId);
  await db.run('DELETE FROM sessions WHERE user_id = ?', userId);
  await db.close();
  res.json({ success: true });
});

app.get('/api/users/me/artists', authMiddleware, async (req, res) => {
  const db = await getDb();
  const artists = await db.all(
    'SELECT id, name, profile_picture, slug FROM artists WHERE user_id = ? OR id = ? ORDER BY name',
    req.user.id,
    req.user.artist_id
  );
  await db.close();
  res.json({ artists });
});

app.get('/api/artists', async (req, res) => {
  const db = await getDb();
  const artists = await db.all(
    'SELECT id, name, location, description, profile_picture, cover_photo, twitch, soundcloud, mixcloud, youtube, slug, user_id, created_at, updated_at FROM artists ORDER BY name'
  );
  await db.close();
  res.json({ artists });
});

app.get('/api/artists/:id', async (req, res) => {
  const db = await getDb();
  const artist = await db.get(
    'SELECT id, name, location, description, profile_picture, cover_photo, twitch, soundcloud, mixcloud, youtube, slug, user_id, created_at, updated_at FROM artists WHERE id = ?',
    req.params.id,
  );
  await db.close();
  if (!artist) {
    return res.status(404).json({ error: 'Artist not found' });
  }
  res.json({ artist });
});

// Private endpoint for managing artist details (includes stream keys)
app.get('/api/artists/:id/manage', authMiddleware, canManageArtist, async (req, res) => {
  res.json({ artist: req.artist });
});

app.post('/api/artists/:id/stream-key', authMiddleware, canManageArtist, async (req, res) => {
  const newKey = uuidv4();
  const db = await getDb();
  await db.run('UPDATE artists SET stream_key = ? WHERE id = ?', newKey, req.params.id);
  await db.close();
  res.json({ stream_key: newKey });
});

app.post('/api/artists', authMiddleware, adminOnly, async (req, res) => {
  const { name, location, description, twitch, soundcloud, mixcloud, youtube, cover_photo, twitch_stream_key, slug, user_id } = req.body || {};
  if (!name) {
    return res.status(400).json({ error: 'Artist name is required' });
  }

  const db = await getDb();
  try {
    const result = await db.run(
      'INSERT INTO artists (name, location, description, twitch, soundcloud, mixcloud, youtube, cover_photo, twitch_stream_key, slug, stream_key, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      name,
      location || '',
      description || '',
      twitch || '',
      soundcloud || '',
      mixcloud || '',
      youtube || '',
      cover_photo || null,
      twitch_stream_key || '',
      slug || name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
      uuidv4(),
      user_id || null,
    );
    const artist = await db.get('SELECT * FROM artists WHERE id = ?', result.lastID);
    res.status(201).json({ artist });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      res.status(409).json({ error: 'Slug is already taken' });
    } else {
      res.status(500).json({ error: 'Unable to create artist' });
    }
  } finally {
    await db.close();
  }
});

app.put('/api/artists/:id', authMiddleware, canManageArtist, async (req, res) => {
  const update = req.body || {};
  const artist = req.artist;
  const db = await getDb();

  const updateFields = {
    name: update.name !== undefined ? update.name : artist.name,
    location: update.location !== undefined ? update.location : artist.location,
    description: update.description !== undefined ? update.description : artist.description,
    twitch: update.twitch !== undefined ? update.twitch : artist.twitch,
    soundcloud: update.soundcloud !== undefined ? update.soundcloud : artist.soundcloud,
    mixcloud: update.mixcloud !== undefined ? update.mixcloud : artist.mixcloud,
    youtube: update.youtube !== undefined ? update.youtube : artist.youtube,
    profile_picture: update.profile_picture !== undefined ? update.profile_picture : artist.profile_picture,
    cover_photo: update.cover_photo !== undefined ? update.cover_photo : artist.cover_photo,
    twitch_stream_key: update.twitch_stream_key !== undefined ? update.twitch_stream_key : artist.twitch_stream_key,
    slug: update.slug !== undefined ? update.slug : artist.slug,
    user_id: artist.user_id,
  };

  if (req.user.role === 'admin' && update.user_id !== undefined) {
    updateFields.user_id = update.user_id || null;
  }

  try {
    await db.run(
      `UPDATE artists SET name = ?, location = ?, description = ?, twitch = ?, soundcloud = ?, mixcloud = ?, youtube = ?, profile_picture = ?, cover_photo = ?, twitch_stream_key = ?, slug = ?, user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      updateFields.name,
      updateFields.location,
      updateFields.description,
      updateFields.twitch,
      updateFields.soundcloud,
      updateFields.mixcloud,
      updateFields.youtube,
      updateFields.profile_picture,
      updateFields.cover_photo,
      updateFields.twitch_stream_key,
      updateFields.slug,
      updateFields.user_id,
      artist.id,
    );

    const updatedArtist = await db.get('SELECT * FROM artists WHERE id = ?', artist.id);
    res.json({ artist: updatedArtist });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      res.status(409).json({ error: 'Slug is already taken' });
    } else {
      res.status(500).json({ error: 'Unable to update artist' });
    }
  } finally {
    await db.close();
  }
});

app.delete('/api/artists/:id', authMiddleware, adminOnly, async (req, res) => {
  const db = await getDb();
  const artist = await db.get('SELECT * FROM artists WHERE id = ?', req.params.id);
  if (!artist) {
    await db.close();
    return res.status(404).json({ error: 'Artist not found' });
  }
  const images = await db.all('SELECT filename FROM artist_images WHERE artist_id = ?', artist.id);
  for (const img of images) {
    const filePath = path.join(__dirname, 'uploads', img.filename);
    try {
      await fs.promises.unlink(filePath);
    } catch (err) {
      console.error(`Failed to delete file: ${filePath}`, err);
    }
  }

  await db.run('DELETE FROM artists WHERE id = ?', artist.id);
  await db.run('DELETE FROM artist_images WHERE artist_id = ?', artist.id);
  await db.close();
  res.json({ success: true });
});

app.post('/api/artists/:id/upload', authMiddleware, canManageArtist, upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Image is required' });
  }
  const imageUrl = `/uploads/${req.file.filename}`;
  const db = await getDb();
  await db.run('INSERT INTO artist_images (artist_id, filename) VALUES (?, ?)', req.artist.id, req.file.filename);
  await db.run(
    'UPDATE artists SET profile_picture = ? WHERE id = ? AND COALESCE(profile_picture, "") = ""',
    imageUrl,
    req.artist.id,
  );
  await db.close();
  res.json({ imageUrl, filename: req.file.filename });
});

app.get('/api/artists/:id/images', async (req, res) => {
  const db = await getDb();
  const images = await db.all('SELECT id, filename, created_at FROM artist_images WHERE artist_id = ? ORDER BY created_at DESC', req.params.id);
  await db.close();
  res.json({ images: images.map((image) => ({ id: image.id, url: `/uploads/${image.filename}`, created_at: image.created_at })) });
});

app.get('/api/images', async (req, res) => {
  const db = await getDb();
  const images = await db.all('SELECT id, artist_id, filename, created_at FROM artist_images ORDER BY created_at DESC LIMIT 50');
  await db.close();
  res.json({ images: images.map((image) => ({ id: image.id, artist_id: image.artist_id, url: `/uploads/${image.filename}`, created_at: image.created_at })) });
});

app.delete('/api/artists/:id/images/:imageId', authMiddleware, canManageArtist, async (req, res) => {
  const db = await getDb();
  const image = await db.get('SELECT * FROM artist_images WHERE id = ? AND artist_id = ?', req.params.imageId, req.artist.id);
  if (!image) {
    await db.close();
    return res.status(404).json({ error: 'Image not found' });
  }
  await db.run('DELETE FROM artist_images WHERE id = ?', image.id);
  const filePath = path.join(__dirname, 'uploads', image.filename);
  try {
    await fs.promises.unlink(filePath);
  } catch (err) {
    console.error(`Failed to delete file: ${filePath}`, err);
  }
  if (req.artist.profile_picture === `/uploads/${image.filename}`) {
    const nextImage = await db.get('SELECT * FROM artist_images WHERE artist_id = ? ORDER BY created_at DESC LIMIT 1', req.artist.id);
    const nextUrl = nextImage ? `/uploads/${nextImage.filename}` : null;
    await db.run('UPDATE artists SET profile_picture = ? WHERE id = ?', nextUrl, req.artist.id);
  }
  await db.close();
  res.json({ success: true });
});

app.get('/api/live/twitch', async (req, res) => {
  const db = await getDb();
  const artists = await db.all('SELECT id, name, twitch, slug FROM artists WHERE twitch IS NOT NULL AND twitch != ""');
  await db.close();
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
    res.status(500).json({ error: 'Failed to fetch streams' });
  }
});

app.get('/api/admin/stats', authMiddleware, adminOnly, async (req, res) => {
  try {
    const stats = await getRtmpStats();
    res.json({ stats });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch server stats' });
  }
});

app.get('/api/feed', async (req, res) => {
  const db = await getDb();
  const artists = await db.all('SELECT id, name, profile_picture, twitch, soundcloud, mixcloud FROM artists ORDER BY updated_at DESC LIMIT 50');
  await db.close();
  const feed = [];
  for (const artist of artists) {
    if (artist.twitch) {
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

const server = app.listen(apiPort, () => {
  console.log(`MSS API server running on http://localhost:${apiPort}`);
});

async function shutdown() {
  console.log('\nShutting down server...');
  server.close(async () => {
    await stopRtmpServer();
    process.exit(0);
  });
  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
