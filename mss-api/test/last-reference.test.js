import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, response } from './harness.js';
import { memoryDb } from './memory-db.js';

async function fixture(initial = {}, fail = () => false) {
  const db = memoryDb({
    users: [{ id: 9, role: 'admin' }],
    sessions: [{ token: 't', user_id: 9, expires_at: '2099-01-01' }],
    artists: [{ id: 2, user_id: 9 }], events: [{ id: 1, creator_id: 9 }], ...initial
  }, fail);
  const files = new Set(), journal = [];
  const transaction = db.transaction;
  db.transaction = async fn => {
    journal.push('begin');
    try { const result = await transaction(fn); journal.push('commit'); return result; }
    catch (error) { journal.push('rollback'); throw error; }
  };
  db.raw = async sql => { assert.match(sql, /pg_advisory_xact_lock\(1297306453\)/); journal.push('lock'); };
  let sequence = 0;
  const h = await harness({
    getDb: async () => db, uuidv4: () => `probe-${++sequence}`,
    decodeImage: async () => Buffer.from('safe'),
    fs: { existsSync: () => true, promises: {
      mkdir: async () => {}, writeFile: async p => files.add(p),
      rename: async (a, b) => { files.delete(a); files.add(b); },
      unlink: async p => { journal.push('unlink'); files.delete(p); }
    } }
  });
  async function run(method, url, params, body, file) {
    const req = { params, headers: { authorization: 'Bearer t' }, body, file };
    const res = response(), listeners = [];
    res.once = (event, fn) => { if (event === 'finish') listeners.push(fn); };
    try {
      for (const fn of h.route(method, url).handlers) {
        let next = false;
        await fn(req, res, error => { if (error) throw error; next = true; });
        if (!next) break;
      }
    } finally { for (const fn of listeners) fn(); }
    return res;
  }
  const upload = () => run('post', '/api/events/:id/flyer', { id: 1 }, undefined, { buffer: Buffer.from('input') });
  return { db, files, run, upload, journal };
}

for (const method of ['put', 'delete']) {
  test(`artist ${method} cleanup is deduplicated and takes advisory lock after mutation commit`, async () => {
    const url = '/uploads/a.webp';
    const { db, files, run, journal } = await fixture({
      artists: [{ id: 2, user_id: 9, profile_picture: url, cover_photo: url }],
      uploads: [{ filename: 'a.webp', bytes: 4, user_id: 9 }]
    });
    files.add('/tmp/mss-test/uploads/a.webp');
    assert.equal((await run(method, '/api/artists/:id', { id: 2 }, method === 'put' ? { profile_picture: null, cover_photo: null } : undefined)).code, 200);
    assert.deepEqual(journal, ['begin', 'lock', 'commit', 'begin', 'lock', 'unlink', 'commit']);
    assert.equal(files.size, 0); assert.equal(db.state().uploads.length, 0);
  });
}

for (const field of ['profile_picture', 'cover_photo']) {
  for (const replacement of [null, '', '/uploads/replacement.webp']) {
    test(`artist ${field} replacement ${JSON.stringify(replacement)} reclaims its previous managed upload`, async () => {
      const { db, files, run, upload } = await fixture();
      const first = await upload();
      const url = first.body.flyerUrl;
      assert.equal((await run('put', '/api/artists/:id', { id: 2 }, { [field]: url })).code, 200);
      await upload();
      assert.equal(files.size, 2);
      assert.equal((await run('put', '/api/artists/:id', { id: 2 }, { [field]: replacement })).code, 200);
      assert.equal(files.size, 1);
      assert.equal(db.state().uploads.length, 1);
      assert.equal(db.state().artists[0][field], replacement);
    });
  }
}

for (const batch of [false, true]) {
  for (const embedded of [false, true]) {
    test(`settings ${batch ? 'batch' : 'single'} removes last ${embedded ? 'embedded' : 'pointer'} reference`, async () => {
      const { db, files, run, upload } = await fixture({ system_settings: [{ key: 'cover', value: null }] });
      const url = (await upload()).body.flyerUrl;
      const setting = value => batch
        ? run('post', '/api/settings/batch', {}, { settings: [{ key: 'cover', value }] })
        : run('put', '/api/settings/:key', { key: 'cover' }, { value });
      assert.equal((await setting(embedded ? `<p><img src="${url}?size=large"></p>` : url)).code, 200);
      await upload();
      assert.equal(files.size, 2);
      assert.equal((await setting(null)).code, 200);
      assert.equal(files.size, 1);
      assert.equal(db.state().uploads.length, 1);
    });
  }
}

for (const removal of ['artist-update', 'artist-delete', 'setting-single', 'setting-batch']) {
  test(`${removal} rollback after handler preserves files, references and quota`, async () => {
    const url = '/uploads/a.webp';
    const { db, files, run } = await fixture({
      artists: [{ id: 2, user_id: 9, ...(removal.startsWith('artist') ? { profile_picture: url, cover_photo: url } : {}) }],
      system_settings: [{ key: 'cover', value: removal.startsWith('setting') ? url : null }],
      uploads: [{ filename: 'a.webp', bytes: 4, user_id: 9 }]
    });
    files.add('/tmp/mss-test/uploads/a.webp');
    const before = structuredClone(db.state());
    const transaction = db.transaction;
    let depth = 0;
    db.transaction = fn => transaction(async trx => {
      depth++;
      try {
        const result = await fn(trx);
        if (depth === 1) throw Object.assign(new Error('injected commit failure'), { code: '23503' });
        return result;
      } finally { depth--; }
    });
    const request = removal === 'artist-update'
      ? () => run('put', '/api/artists/:id', { id: 2 }, { profile_picture: null, cover_photo: null })
      : removal === 'artist-delete'
        ? () => run('delete', '/api/artists/:id', { id: 2 })
        : removal === 'setting-single'
          ? () => run('put', '/api/settings/:key', { key: 'cover' }, { value: null })
          : () => run('post', '/api/settings/batch', {}, { settings: [{ key: 'cover', value: null }] });
    await assert.rejects(request(), { code: '23503' });
    assert.deepEqual(db.state(), before);
    assert.deepEqual([...files], ['/tmp/mss-test/uploads/a.webp']);
  });
}

test('remaining references across every protected table retain file until final setting removal', async () => {
  const url = '/uploads/a.webp';
  const { db, files, run } = await fixture({
    artists: [{ id: 2, user_id: 9, profile_picture: url, cover_photo: url }],
    events: [{ id: 1, creator_id: 9, flyer: url }],
    artist_images: [{ id: 3, artist_id: 2, filename: 'a.webp' }],
    event_images: [{ id: 4, event_id: 1, filename: 'a.webp' }],
    system_settings: [{ key: 'cover', value: url }, { key: 'about', value: `<img src="${url}">` }],
    uploads: [{ filename: 'a.webp', bytes: 4, user_id: 9 }]
  });
  files.add('/tmp/mss-test/uploads/a.webp');
  const keep = () => { assert.equal(files.size, 1); assert.equal(db.state().uploads.length, 1); };
  assert.equal((await run('put', '/api/artists/:id', { id: 2 }, { profile_picture: null })).code, 200); keep();
  assert.equal((await run('put', '/api/artists/:id', { id: 2 }, { cover_photo: null })).code, 200); keep();
  assert.equal((await run('delete', '/api/artists/:id', { id: 2 })).code, 200); keep();
  assert.equal((await run('delete', '/api/events/:id', { id: 1 })).code, 200); keep();
  assert.equal((await run('put', '/api/settings/:key', { key: 'cover' }, { value: null })).code, 200); keep();
  assert.equal((await run('put', '/api/settings/:key', { key: 'about' }, { value: '' })).code, 200);
  assert.equal(files.size, 0); assert.equal(db.state().uploads.length, 0);
});

test('batch moves a shared URL between settings without premature reclamation', async () => {
  const url = '/uploads/a.webp';
  const { db, files, run } = await fixture({
    system_settings: [{ key: 'one', value: url }, { key: 'two', value: null }],
    uploads: [{ filename: 'a.webp', bytes: 4, user_id: 9 }]
  });
  files.add('/tmp/mss-test/uploads/a.webp');
  const batch = settings => run('post', '/api/settings/batch', {}, { settings });
  assert.equal((await batch([{ key: 'one', value: null }, { key: 'two', value: `<img src="${url}">` }])).code, 200);
  assert.equal(files.size, 1); assert.equal(db.state().uploads.length, 1);
  assert.equal((await batch([{ key: 'two', value: '/uploads/other.webp' }])).code, 200);
  assert.equal(files.size, 0); assert.equal(db.state().uploads.length, 0);
});

test('only removed managed references are reconsidered; legacy and unrelated files are untouched', async () => {
  const { db, files, run } = await fixture({
    artists: [{ id: 2, user_id: 9, profile_picture: '/uploads/legacy.webp', cover_photo: 'https://elsewhere.example/uploads/unrelated.webp' }],
    system_settings: [{ key: 'about', value: '<img src="/uploads/legacy.webp"><img src="/uploads/a.webp">' }],
    uploads: [{ filename: 'a.webp', bytes: 4, user_id: 9 }, { filename: 'unrelated.webp', bytes: 4, user_id: 9 }]
  });
  for (const name of ['a.webp', 'legacy.webp', 'unrelated.webp']) files.add(`/tmp/mss-test/uploads/${name}`);
  assert.equal((await run('put', '/api/artists/:id', { id: 2 }, { profile_picture: null, cover_photo: null })).code, 200);
  assert.equal(files.size, 3);
  assert.equal((await run('put', '/api/settings/:key', { key: 'about' }, { value: null })).code, 200);
  assert.deepEqual([...files].sort(), ['/tmp/mss-test/uploads/legacy.webp', '/tmp/mss-test/uploads/unrelated.webp']);
  assert.deepEqual(db.state().uploads.map(row => row.filename), ['unrelated.webp']);
});

test('five-request shared flyer lifecycle reclaims final artist reference and quota', async () => {
  const { db, files, run, upload } = await fixture();
  const first = await upload();
  assert.equal(first.code, 200);
  assert.equal((await run('put', '/api/artists/:id', { id: 2 }, { cover_photo: first.body.flyerUrl })).code, 200);
  assert.equal((await upload()).code, 200);
  assert.equal(db.state().uploads.length, 2);
  assert.equal(files.size, 2, 'shared A must survive replacement');
  assert.equal((await run('delete', '/api/artists/:id', { id: 2 })).code, 200);
  assert.equal((await run('delete', '/api/events/:id', { id: 1 })).code, 200);
  assert.equal(db.state().artists.length, 0);
  assert.equal(db.state().events.length, 0);
  assert.equal(files.size, 0, 'last reference removal must reclaim A');
  assert.equal(db.state().uploads.length, 0, 'reclaimed files must release quota');
});
