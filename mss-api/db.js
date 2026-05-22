import knex from 'knex';
import crypto from 'crypto';
import knexConfig from './knexfile.js';
import 'dotenv/config';

const db = knex(knexConfig.development);

export async function getDb() {
  return db;
}

export function hashPassword(password) {
  return crypto.createHash('md5').update(password).digest('hex');
}

export async function initializeDB() {
  console.log('Ensuring database schema is up to date...');
  await db.migrate.latest();
  console.log('Database schema is current.');
}
