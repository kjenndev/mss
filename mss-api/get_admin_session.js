
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

async function test() {
  const db = await open({
    filename: './mss.db',
    driver: sqlite3.Database,
  });

  const adminSession = await db.get('SELECT * FROM sessions WHERE user_id = 1 LIMIT 1');
  console.log(JSON.stringify(adminSession, null, 2));

  await db.close();
}

test();
