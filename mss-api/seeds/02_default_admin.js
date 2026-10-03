import { hashPassword } from '../db.js';

// Explicit one-time provisioning only; never reset an existing account.
export async function seed(knex) {
  const username = process.env.MSS_ADMIN_USERNAME || 'admin';
  if (username.length > 100 || !username.trim()) throw new Error('Invalid MSS_ADMIN_USERNAME');
  if (await knex('users').whereRaw('lower(username) = lower(?)', [username]).first()) return;
  const password = process.env.MSS_ADMIN_PASSWORD;
  if (typeof password !== 'string' || password.length < 5 || password.length > 1024) throw new Error('Set MSS_ADMIN_PASSWORD to an explicit 5–1024 character secret before provisioning');
  await knex('users').insert({ username, password: await hashPassword(password), role: 'admin', display_name: 'Administrator' });
}
