
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

async function dump() {
  const db = await open({
    filename: './mss.db',
    driver: sqlite3.Database,
  });

  console.log('--- ARTISTS ---');
  const artists = await db.all('SELECT id, name, cover_photo, profile_picture FROM artists');
  console.log(JSON.stringify(artists, null, 2));

  await db.close();
}

dump();
