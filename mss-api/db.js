import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, 'mss.db');

export async function getDb() {
  return open({
    filename: dbPath,
    driver: sqlite3.Database,
  });
}

export function hashPassword(password) {
  return crypto.createHash('md5').update(password).digest('hex');
}

export async function initializeDB() {
  const db = await getDb();

  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'artist',
      artist_id INTEGER,
      is_disabled INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS artists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      location TEXT,
      description TEXT,
      profile_picture TEXT,
      twitch TEXT,
      soundcloud TEXT,
      mixcloud TEXT,
      youtube TEXT,
      cover_photo TEXT,
      twitch_stream_key TEXT,
      slug TEXT UNIQUE,
      stream_key TEXT,
      user_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS recordings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      artist_id INTEGER NOT NULL,
      slug TEXT NOT NULL,
      path TEXT NOT NULL,
      duration REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migration: Add missing columns if table already exists
  const tableInfo = await db.all("PRAGMA table_info(artists)");
  const columns = tableInfo.map(c => c.name);
  
  if (!columns.includes('youtube')) {
    await db.exec("ALTER TABLE artists ADD COLUMN youtube TEXT");
  }

  if (!columns.includes('cover_photo')) {
    await db.exec("ALTER TABLE artists ADD COLUMN cover_photo TEXT");
  }

  if (!columns.includes('twitch_stream_key')) {
    await db.exec("ALTER TABLE artists ADD COLUMN twitch_stream_key TEXT");
  }

  if (!columns.includes('slug')) {
    await db.exec("ALTER TABLE artists ADD COLUMN slug TEXT");
    const artists = await db.all('SELECT id, name FROM artists');
    for (const artist of artists) {
      const slugBase = artist.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
      await db.run('UPDATE artists SET slug = ? WHERE id = ?', `${slugBase}-${artist.id}`, artist.id);
    }
  }

  if (!columns.includes('stream_key')) {
    await db.exec("ALTER TABLE artists ADD COLUMN stream_key TEXT");
    const artists = await db.all('SELECT id FROM artists');
    for (const artist of artists) {
      await db.run('UPDATE artists SET stream_key = ? WHERE id = ?', uuidv4(), artist.id);
    }
  }

  const userTableInfo = await db.all("PRAGMA table_info(users)");
  const userColumns = userTableInfo.map(c => c.name);
  if (!userColumns.includes('is_disabled')) {
    await db.exec("ALTER TABLE users ADD COLUMN is_disabled INTEGER DEFAULT 0");
  }

  await db.exec(`
    CREATE TABLE IF NOT EXISTS artist_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      artist_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      date DATETIME,
      location TEXT,
      ticket_link TEXT,
      flyer TEXT,
      creator_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS event_artists (
      event_id INTEGER NOT NULL,
      artist_id INTEGER NOT NULL,
      PRIMARY KEY (event_id, artist_id)
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS event_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      artist_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const adminUser = await db.get('SELECT * FROM users WHERE username = ?', 'admin');
  if (!adminUser) {
    const passwordHash = hashPassword('admin');
    await db.run('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', 'admin', passwordHash, 'admin');
    console.log('Created default admin user: admin / admin');
  }

  await db.close();
}
