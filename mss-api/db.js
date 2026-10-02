import knex from 'knex';
import crypto from 'crypto';
import knexConfig from './knexfile.js';
import 'dotenv/config';

const db = knex(knexConfig.development);

export async function getDb() {
  return db;
}

const derive = (password, salt) => new Promise((resolve, reject) => {
  crypto.scrypt(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key));
});
export async function hashPassword(password) {
  if (typeof password !== 'string' || !password || password.length > 1024) throw new TypeError('Invalid password');
  const salt = crypto.randomBytes(16).toString('hex');
  return `scrypt$${salt}$${(await derive(password, salt)).toString('hex')}`;
}
export async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || !password || password.length > 1024 || typeof stored !== 'string') return false;
  if (/^[a-f0-9]{32}$/i.test(stored)) return crypto.timingSafeEqual(crypto.createHash('md5').update(password).digest(), Buffer.from(stored, 'hex'));
  if (!/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(stored)) return false;
  const [, salt, hash] = stored.split('$');
  return crypto.timingSafeEqual(await derive(password, salt), Buffer.from(hash, 'hex'));
}

export async function initializeDB() {
  console.log('Ensuring database schema is up to date...');
  await db.migrate.latest();
  console.log('Database schema is current.');
}
