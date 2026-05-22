import crypto from 'crypto';

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> } 
 */
export const seed = async function(knex) {
  const adminUser = await knex('users').where({ username: 'admin' }).first();
  if (!adminUser) {
    const passwordHash = crypto.createHash('md5').update('admin').digest('hex');
    await knex('users').insert({
      username: 'admin',
      password: passwordHash,
      role: 'admin'
    });
    console.log('Created default admin user: admin / admin');
  }
};
