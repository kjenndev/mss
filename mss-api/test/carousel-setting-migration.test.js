import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migrationUrl = new URL('../migrations/20261010020000_homepage_carousel_interval.js', import.meta.url);

test('carousel interval migration adds the eight-second system setting and removes only that key', async () => {
  assert.equal(fs.existsSync(migrationUrl), true, 'carousel interval migration must exist');
  const migration = await import(migrationUrl.href);
  const operations = [];
  const knex = table => ({
    insert: async row => operations.push(['insert', table, row]),
    where: criteria => ({ del: async () => operations.push(['delete', table, criteria]) }),
  });
  await migration.up(knex);
  await migration.down(knex);
  assert.deepEqual(operations, [
    ['insert', 'system_settings', {
      key: 'homepage_carousel_interval_seconds',
      value: '8',
      description: 'Seconds between automatic homepage carousel slides (1-3600)',
    }],
    ['delete', 'system_settings', { key: 'homepage_carousel_interval_seconds' }],
  ]);
});
