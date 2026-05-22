import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { initializeDB, getDb, hashPassword } from './db.js';
import { getActiveStreams, stopDiscovery, getStreamStats } from './streams.js';
import 'dotenv/config';

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
// Streaming discovery is initialized on demand via getRedis()

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.replace('Bearer ', '');
  const db = await getDb();
  const session = await db('sessions').where({ token }).first();
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const user = await db('users')
    .select('id', 'username', 'role', 'artist_id', 'is_disabled', 'display_name')
    .where({ id: session.user_id })
    .first();
  
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
  const artist = await db('artists').where({ id: artistId }).first();

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

async function canManageEvent(req, res, next) {
  const eventId = Number(req.params.id);
  const db = await getDb();
  const event = await db('events').where({ id: eventId }).first();

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
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password required' });
  }

  const db = await getDb();
  const passwordHash = hashPassword(password);
  const user = await db('users')
    .where({ username, password: passwordHash })
    .first();
    
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  if (user.is_disabled) {
    return res.status(403).json({ error: 'Account is disabled' });
  }

  const token = uuidv4();
  await db('sessions').insert({ token, user_id: user.id });

  res.json({ token, user });
});

app.post('/api/auth/logout', authMiddleware, async (req, res) => {
  const db = await getDb();
  await db('sessions').where({ token: req.token }).del();
  res.json({ success: true });
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  res.json({ user: req.user });
});

app.put('/api/auth/me', authMiddleware, async (req, res) => {
  const { username, password, display_name } = req.body || {};
  const db = await getDb();

  const updateFields = {
    username: username !== undefined ? username : req.user.username,
    display_name: display_name !== undefined ? display_name : req.user.display_name,
  };

  try {
    if (password) {
      updateFields.password = hashPassword(password);
    }

    await db('users').where({ id: req.user.id }).update(updateFields);

    const updatedUser = await db('users')
      .select('id', 'username', 'role', 'artist_id', 'display_name')
      .where({ id: req.user.id })
      .first();
      
    res.json({ user: updatedUser });
  } catch (error) {
    if (error.message.includes('unique constraint') || error.message.includes('UNIQUE constraint')) {
      res.status(409).json({ error: 'Username is already taken' });
    } else {
      console.error(error);
      res.status(500).json({ error: 'Unable to update profile' });
    }
  }
});

app.post('/api/users', authMiddleware, adminOnly, async (req, res) => {
  const { username, password, role = 'artist', artist_id, display_name } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }

  const db = await getDb();
  try {
    const hashed = hashPassword(password);
    const [userIdObj] = await db('users').insert({
      username,
      password: hashed,
      role,
      artist_id: artist_id || null,
      display_name: display_name || username
    }).returning('id');
    
    const userId = typeof userIdObj === 'object' ? userIdObj.id : userIdObj;
    
    const user = await db('users')
      .select('id', 'username', 'role', 'artist_id', 'is_disabled', 'display_name')
      .where({ id: userId })
      .first();

    res.status(201).json({ user });
  } catch (error) {
    if (error.message.includes('unique constraint') || error.message.includes('UNIQUE constraint')) {
      res.status(409).json({ error: 'Username is already taken' });
    } else {
      console.error(error);
      res.status(500).json({ error: 'Unable to create user' });
    }
  }
});

app.get('/api/users', authMiddleware, adminOnly, async (req, res) => {
  const db = await getDb();
  const users = await db('users')
    .select('id', 'username', 'role', 'artist_id', 'is_disabled', 'display_name')
    .orderBy('username');
  
  const usersWithArtists = await Promise.all(users.map(async (u) => {
    const ownedArtists = await db('artists')
      .select('id', 'name')
      .where({ user_id: u.id });
    
    if (u.artist_id) {
      const primaryArtist = await db('artists')
        .select('id', 'name')
        .where({ id: u.artist_id })
        .first();

      if (primaryArtist && !ownedArtists.find(a => a.id === primaryArtist.id)) {
        ownedArtists.push(primaryArtist);
      }
    }
    return { ...u, ownedArtists };
  }));
  
  res.json({ users: usersWithArtists });
});

app.put('/api/users/:id', authMiddleware, adminOnly, async (req, res) => {
  const { username, password, role, artist_id, ownedArtistIds, is_disabled, display_name } = req.body || {};
  const userId = req.params.id;
  const db = await getDb();
  
  const existingUser = await db('users').where({ id: userId }).first();
  if (!existingUser) {
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
    is_disabled: is_disabled !== undefined ? (is_disabled ? 1 : 0) : existingUser.is_disabled,
    display_name: display_name !== undefined ? display_name : existingUser.display_name
  };

  try {
    if (password) {
      updateFields.password = hashPassword(password);
    }

    await db('users').where({ id: userId }).update(updateFields);

    if (Array.isArray(ownedArtistIds)) {
      await db('artists').where({ user_id: userId }).update({ user_id: null });
      if (ownedArtistIds.length > 0) {
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
    if (error.message.includes('unique constraint') || error.message.includes('UNIQUE constraint')) {
      res.status(409).json({ error: 'Username is already taken' });
    } else {
      console.error('Update User Error:', error);
      res.status(500).json({ error: 'Unable to update user' });
    }
  }
});

app.delete('/api/users/:id', authMiddleware, adminOnly, async (req, res) => {
  const userId = req.params.id;
  if (Number(userId) === req.user.id) {
    return res.status(400).json({ error: 'Cannot delete your own admin account' });
  }
  const db = await getDb();
  await db('sessions').where({ user_id: userId }).del();
  await db('users').where({ id: userId }).del();
  res.json({ success: true });
});

app.get('/api/users/me/artists', authMiddleware, async (req, res) => {
  const db = await getDb();
  const artists = await db('artists')
    .select('id', 'name', 'profile_picture', 'slug')
    .where('user_id', req.user.id)
    .orWhere('id', req.user.artist_id || 0)
    .orderBy('name');
  res.json({ artists });
});

app.get('/api/artists', async (req, res) => {
  const db = await getDb();
  const artists = await db('artists')
    .select('id', 'name', 'location', 'description', 'profile_picture', 'cover_photo', 'twitch', 'soundcloud', 'mixcloud', 'youtube', 'slug', 'user_id', 'channel_name', 'created_at', 'updated_at')
    .orderBy('name');
  res.json({ artists });
});

app.get('/api/artists/:id', async (req, res) => {
  const db = await getDb();
  const artist = await db('artists')
    .where({ id: req.params.id })
    .first();
    
  if (!artist) {
    return res.status(404).json({ error: 'Artist not found' });
  }
  res.json({ artist });
});

app.get('/api/artists/:id/manage', authMiddleware, canManageArtist, async (req, res) => {
  res.json({ artist: req.artist });
});

app.post('/api/artists', authMiddleware, adminOnly, async (req, res) => {
  const { name, location, description, twitch, soundcloud, mixcloud, youtube, cover_photo, slug, user_id, channel_name } = req.body || {};
  if (!name) {
    return res.status(400).json({ error: 'Artist name is required' });
  }

  const db = await getDb();
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
    const artist = await db('artists').where({ id: artistId }).first();
    res.status(201).json({ artist });
  } catch (err) {
    if (err.message.includes('unique constraint') || err.message.includes('UNIQUE constraint')) {
      res.status(409).json({ error: 'Slug is already taken' });
    } else {
      console.error(err);
      res.status(500).json({ error: 'Unable to create artist' });
    }
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
    slug: update.slug !== undefined ? update.slug : artist.slug,
    channel_name: update.channel_name !== undefined ? update.channel_name : artist.channel_name,
    updated_at: db.fn.now()
  };

  if (req.user.role === 'admin' && update.user_id !== undefined) {
    updateFields.user_id = update.user_id || null;
  }

  try {
    await db('artists').where({ id: artist.id }).update(updateFields);
    const updatedArtist = await db('artists').where({ id: artist.id }).first();
    res.json({ artist: updatedArtist });
  } catch (err) {
    if (err.message.includes('unique constraint') || err.message.includes('UNIQUE constraint')) {
      res.status(409).json({ error: 'Slug is already taken' });
    } else {
      console.error(err);
      res.status(500).json({ error: 'Unable to update artist' });
    }
  }
});

app.delete('/api/artists/:id', authMiddleware, adminOnly, async (req, res) => {
  const db = await getDb();
  const artist = await db('artists').where({ id: req.params.id }).first();
  if (!artist) {
    return res.status(404).json({ error: 'Artist not found' });
  }
  
  const images = await db('artist_images').where({ artist_id: artist.id });
  for (const img of images) {
    const filePath = path.join(__dirname, 'uploads', img.filename);
    try {
      await fs.promises.unlink(filePath);
    } catch (err) {
      console.error(`Failed to delete file: ${filePath}`, err);
    }
  }

  await db('artists').where({ id: artist.id }).del();
  await db('artist_images').where({ artist_id: artist.id }).del();
  res.json({ success: true });
});

app.post('/api/artists/:id/upload', authMiddleware, canManageArtist, upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Image is required' });
  }
  const imageUrl = `/uploads/${req.file.filename}`;
  const db = await getDb();
  await db('artist_images').insert({ artist_id: req.artist.id, filename: req.file.filename });
  
  if (!req.artist.profile_picture) {
    await db('artists').where({ id: req.artist.id }).update({ profile_picture: imageUrl });
  }
  
  res.json({ imageUrl, filename: req.file.filename });
});

app.get('/api/artists/:id/images', async (req, res) => {
  const db = await getDb();
  const images = await db('artist_images')
    .where({ artist_id: req.params.id })
    .orderBy('created_at', 'desc');
  res.json({ images: images.map((image) => ({ id: image.id, url: `/uploads/${image.filename}`, created_at: image.created_at })) });
});

app.get('/api/images', async (req, res) => {
  const db = await getDb();
  const images = await db('artist_images')
    .orderBy('created_at', 'desc')
    .limit(50);
  res.json({ images: images.map((image) => ({ id: image.id, artist_id: image.artist_id, url: `/uploads/${image.filename}`, created_at: image.created_at })) });
});

app.delete('/api/artists/:id/images/:imageId', authMiddleware, canManageArtist, async (req, res) => {
  const db = await getDb();
  const image = await db('artist_images')
    .where({ id: req.params.imageId, artist_id: req.artist.id })
    .first();
    
  if (!image) {
    return res.status(404).json({ error: 'Image not found' });
  }
  
  await db('artist_images').where({ id: image.id }).del();
  
  const filePath = path.join(__dirname, 'uploads', image.filename);
  try {
    await fs.promises.unlink(filePath);
  } catch (err) {
    console.error(`Failed to delete file: ${filePath}`, err);
  }
  
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
  const db = await getDb();
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
  const db = await getDb();
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

app.post('/api/events', authMiddleware, async (req, res) => {
  const { title, description, date, location, ticket_link, artist_ids, flyer_artist_name, flyer_artist_url } = req.body || {};
  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }

  const db = await getDb();
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

    const event = await db('events').where({ id: eventId }).first();
    res.status(201).json({ event });
  } catch (err) {
    console.error('Create Event Error:', err);
    res.status(500).json({ error: 'Unable to create event' });
  }
});

app.put('/api/events/:id', authMiddleware, canManageEvent, async (req, res) => {
  const { title, description, date, location, ticket_link, artist_ids, flyer_artist_name, flyer_artist_url } = req.body || {};
  const db = await getDb();
  try {
    await db('events').where({ id: req.event.id }).update({
      title: title !== undefined ? title : req.event.title,
      description: description !== undefined ? description : req.event.description,
      date: date !== undefined ? date : req.event.date,
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
    console.error('Update Event Error:', err);
    res.status(500).json({ error: 'Unable to update event' });
  }
});

app.delete('/api/events/:id', authMiddleware, canManageEvent, async (req, res) => {
  const db = await getDb();
  try {
    const images = await db('event_images').where({ event_id: req.event.id });
    for (const img of images) {
      const filePath = path.join(__dirname, 'uploads', img.filename);
      try {
        await fs.promises.unlink(filePath);
      } catch (err) {
        console.error(`Failed to delete file: ${filePath}`, err);
      }
    }
    
    if (req.event.flyer) {
      const flyerPath = path.join(__dirname, 'uploads', path.basename(req.event.flyer));
      try {
        await fs.promises.unlink(flyerPath);
      } catch (err) {
        console.error(`Failed to delete flyer: ${flyerPath}`, err);
      }
    }

    await db('events').where({ id: req.event.id }).del();
    await db('event_artists').where({ event_id: req.event.id }).del();
    await db('event_images').where({ event_id: req.event.id }).del();

    res.json({ success: true });
  } catch (err) {
    console.error('Delete Event Error:', err);
    res.status(500).json({ error: 'Unable to delete event' });
  }
});

app.post('/api/events/:id/flyer', authMiddleware, canManageEvent, upload.single('flyer'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Flyer image is required' });
  }
  const flyerUrl = `/uploads/${req.file.filename}`;
  const db = await getDb();
  await db('events').where({ id: req.event.id }).update({ flyer: flyerUrl });
  res.json({ flyerUrl });
});

app.post('/api/events/:id/images', authMiddleware, upload.single('image'), async (req, res) => {
  const eventId = req.params.id;
  if (!req.file) {
    return res.status(400).json({ error: 'Image is required' });
  }

  const db = await getDb();
  const event = await db('events').where({ id: eventId }).first();
  if (!event) {
    return res.status(404).json({ error: 'Event not found' });
  }

  const isArtistInEvent = await db('event_artists').where({ event_id: eventId, artist_id: req.user.artist_id || 0 }).first();
  const isAdmin = req.user.role === 'admin';
  const isCreator = Number(event.creator_id) === Number(req.user.id);

  if (isAdmin || isCreator || isArtistInEvent) {
    await db('event_images').insert({
      event_id: eventId,
      artist_id: req.user.artist_id || 0,
      filename: req.file.filename
    });
    res.json({ imageUrl: `/uploads/${req.file.filename}`, filename: req.file.filename });
  } else {
    res.status(403).json({ error: 'Permission required to upload event images' });
  }
});

app.get('/api/artists/:id/events', async (req, res) => {
  const db = await getDb();
  const events = await db('events as e')
    .join('event_artists as ea', 'e.id', 'ea.event_id')
    .select('e.*')
    .where('ea.artist_id', req.params.id)
    .orderBy('e.date', 'desc');
  res.json({ events });
});

app.post('/api/admin/upload', authMiddleware, adminOnly, upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Image is required' });
  }
  const imageUrl = `/uploads/${req.file.filename}`;
  res.json({ imageUrl, filename: req.file.filename });
});

app.get('/api/live/twitch', async (req, res) => {
  const db = await getDb();
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
    res.status(500).json({ error: 'Failed to fetch streams' });
  }
});

app.get('/api/settings', async (req, res) => {
  const db = await getDb();
  const settings = await db('system_settings').select('key', 'value', 'description');
  const settingsMap = {};
  settings.forEach(s => {
    settingsMap[s.key] = s.value;
  });
  res.json({ settings: settingsMap, raw: settings });
});

app.put('/api/settings/:key', authMiddleware, adminOnly, async (req, res) => {
  const { value } = req.body || {};
  console.log(`[Settings] Updating key: ${req.params.key} with value:`, value);
  const db = await getDb();
  try {
    const changes = await db('system_settings').where({ key: req.params.key }).update({ value, updated_at: db.fn.now() });
    console.log(`[Settings] Rows affected: ${changes}`);
    const updated = await db('system_settings').where({ key: req.params.key }).first();
    res.json({ setting: updated });
  } catch (err) {
    console.error(`[Settings] Error updating ${req.params.key}:`, err);
    res.status(500).json({ error: 'Failed to update setting' });
  }
});

app.post('/api/settings/batch', authMiddleware, adminOnly, async (req, res) => {
  const { settings } = req.body || {}; // array of { key, value }
  if (!Array.isArray(settings)) {
    return res.status(400).json({ error: 'Settings array required' });
  }

  const db = await getDb();
  try {
    await db.transaction(async trx => {
      for (const s of settings) {
        await trx('system_settings')
          .where({ key: s.key })
          .update({ value: s.value, updated_at: trx.fn.now() });
      }
    });
    
    const updated = await db('system_settings').select('key', 'value');
    const settingsMap = {};
    updated.forEach(s => {
      settingsMap[s.key] = s.value;
    });
    res.json({ settings: settingsMap });
  } catch (err) {
    console.error('[Settings] Batch update error:', err);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

app.get('/api/admin/stats', authMiddleware, adminOnly, async (req, res) => {
  const db = await getDb();
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
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch server stats' });
  }
});

app.get('/api/comments', async (req, res) => {
  const { artist_id, event_id } = req.query;
  const db = await getDb();
  
  try {
    let query = db('comments')
      .select('*')
      .orderBy('created_at', 'asc');

    if (artist_id) {
      query = query.where('artist_id', artist_id);
    } else if (event_id) {
      query = query.where('event_id', event_id);
    } else {
      return res.status(400).json({ error: 'artist_id or event_id required' });
    }

    const comments = await query;
    res.json({ comments });
  } catch (err) {
    console.error('[Comments] Fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

app.post('/api/comments', async (req, res) => {
  const { content, artist_id, event_id, parent_id, author_name } = req.body || {};
  if (!content) {
    return res.status(400).json({ error: 'Comment content is required' });
  }
  if (!author_name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  const db = await getDb();
  try {
    const [commentIdObj] = await db('comments').insert({
      content,
      user_id: null, // Force no association
      author_name,
      artist_id: artist_id || null,
      event_id: event_id || null,
      parent_id: parent_id || null,
    }).returning('id');

    const commentId = typeof commentIdObj === 'object' ? commentIdObj.id : commentIdObj;
    const comment = await db('comments').where('id', commentId).first();

    res.status(201).json({ comment });
  } catch (err) {
    console.error('[Comments] Create error:', err);
    res.status(500).json({ error: 'Failed to post comment' });
  }
});

app.delete('/api/comments/:id', authMiddleware, async (req, res) => {
  const db = await getDb();
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
    console.error('[Comments] Delete error:', err);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

app.get('/api/feed', async (req, res) => {
  const db = await getDb();
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

const server = app.listen(apiPort, () => {
  console.log(`MSS API server running on http://localhost:${apiPort}`);
});

async function shutdown() {
  console.log('\nShutting down server...');
  server.close(async () => {
    await stopDiscovery();
    process.exit(0);
  });
  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
