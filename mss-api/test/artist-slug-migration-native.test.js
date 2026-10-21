import test from 'node:test';
import assert from 'node:assert/strict';
import knexFactory from 'knex';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const database = process.env.MSS_REGISTRATION_TEST_DB;
const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations');
const migrationName = '20261021020000_artist_name_slugs.js';

async function beforeSlug(db) {
  for (const name of (await readdir(directory)).filter(name => name.endsWith('.js') && name !== migrationName).sort()) {
    await db.migrate.up({ directory, name });
  }
}

test('artist slug migration safely swaps legacy slugs, rolls back invalid data, and enforces canonical uniqueness', { skip: !database }, async () => {
  const db = knexFactory({ client: 'pg', connection: { host: '/var/run/postgresql', database, user: 'postgres' }, migrations: { directory } });
  try {
    await beforeSlug(db);
    await db('artists').insert([
      { name: 'A', slug: 'b' },
      { name: 'B', slug: 'a' },
      { name: '123', slug: 'legacy-numeric' },
      { name: 'Create', slug: 'legacy-reserved' },
      { name: '東京', slug: 'legacy-empty' },
    ]);
    let legacySlugs = ['b', 'a', 'legacy-numeric', 'legacy-reserved', 'legacy-empty'];
    await assert.rejects(db.migrate.up({ directory, name: migrationName }), /cannot form a canonical slug/i);
    assert.deepEqual((await db('artists').orderBy('id').pluck('slug')), legacySlugs);

    await db('artists').where({ name: '123' }).update({ name: 'Valid Numeric Artist' });
    await assert.rejects(db.migrate.up({ directory, name: migrationName }), /cannot form a canonical slug/i);
    assert.deepEqual((await db('artists').orderBy('id').pluck('slug')), legacySlugs);

    await db('artists').where({ name: 'Create' }).update({ name: 'Valid Reserved Artist' });
    await assert.rejects(db.migrate.up({ directory, name: migrationName }), /cannot form a canonical slug/i);
    assert.deepEqual((await db('artists').orderBy('id').pluck('slug')), legacySlugs);

    await db('artists').where({ name: '東京' }).update({ name: 'Valid Artist' });
    await db('artists').insert([
      { name: 'Collision!', slug: 'legacy-one' },
      { name: 'Collision?', slug: 'legacy-two' },
    ]);
    legacySlugs = [...legacySlugs, 'legacy-one', 'legacy-two'];
    await assert.rejects(db.migrate.up({ directory, name: migrationName }), /slug collision/i);
    assert.equal(await db.schema.hasColumn('artists', 'slug'), true);
    assert.deepEqual((await db('artists').orderBy('id').pluck('slug')), legacySlugs);
    await assert.rejects(db('artists').insert({ name: 'Duplicate legacy', slug: 'b' }), error => error.code === '23505');

    await db('artists').where({ name: 'Collision?' }).update({ name: 'Different Name' });
    await db.migrate.up({ directory, name: migrationName });
    assert.deepEqual(await db('artists').orderBy('id').pluck('slug'), ['a', 'b', 'valid-numeric-artist', 'valid-reserved-artist', 'valid-artist', 'collision', 'different-name']);
    await assert.rejects(db('artists').insert({ name: 'Other', slug: 'Collision' }), error => error.code === '23514');
    await assert.rejects(db('artists').insert({ name: 'Other', slug: '123' }), error => error.code === '23514');
    await assert.rejects(db('artists').insert({ name: 'Other', slug: 'create' }), error => error.code === '23514');
    await assert.rejects(db('artists').insert({ name: 'Other', slug: 'collision' }), error => error.code === '23505');
    await assert.rejects(db('artists').insert({ name: 'Other', slug: null }), error => error.code === '23502');
  } finally { await db.destroy(); }
});
