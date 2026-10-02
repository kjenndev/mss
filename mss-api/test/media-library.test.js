import test from 'node:test';
import assert from 'node:assert/strict';
const load = async options => (await import('../media-library.js')).createMediaLibrary(options);
const artist = { id: 1, name: 'Artist', mixcloud: 'https://www.mixcloud.com/artist/', soundcloud: '' };
const show = (slug, created_time) => ({ key: `/artist/${slug}/`, url: `https://www.mixcloud.com/artist/${slug}/`, name: slug, created_time, audio_length: 600 });
const reply = body => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });

test('discovers all Mixcloud pages and sorts original upload dates, deduplicating shows', async () => {
  const calls = [];
  const library = await load({ fetchImpl: async (url, options) => {
    calls.push(String(url));
    assert.equal(options.redirect, 'manual');
    if (calls.length === 1) return reply({ data: [show('old', '2020-01-01T00:00:00Z')], paging: { next: 'https://api.mixcloud.com/artist/cloudcasts/?limit=100&offset=1' } });
    return reply({ data: [show('new', '2024-01-01T00:00:00Z'), show('old', '2020-01-01T00:00:00Z')] });
  }});
  const result = await library.get([artist]);
  assert.deepEqual(result.items.map(x => x.title), ['new', 'old']);
  assert.equal(result.items[0].createdAt, '2024-01-01T00:00:00.000Z');
  assert.equal(result.total, 2);
  assert.equal(result.complete, true);
  assert.equal(result.sources[0].itemCount, 2);
  assert.equal(calls.length, 2);
});

test('rejects unsafe profile/continuation URLs and marks bounded discovery incomplete', async () => {
  let calls = 0;
  const library = await load({ maxPages: 1, fetchImpl: async () => { calls++; if (calls > 1) return reply({ data: [] }); return reply({ data: [show('safe', '2020-01-01')], paging: { next: 'https://api.mixcloud.com/artist/cloudcasts/?offset=100' } }); } });
  const result = await library.get([artist, { ...artist, id: 2, mixcloud: 'https://127.0.0.1/private' }]);
  assert.equal(result.complete, false);
  assert.deepEqual(result.sources.map(s => s.status), ['partial', 'invalid_profile']);
  assert.equal(calls, 1);
  const unsafe = await load({ fetchImpl: async () => { calls++; return reply({ data: [show('safe', 'bad date')], paging: { next: 'https://api.mixcloud.com@localhost/secret' } }); } });
  const blocked = await unsafe.get([artist]);
  assert.equal(calls, 2);
  assert.equal(blocked.sources[0].status, 'partial');
  assert.equal(blocked.items[0].createdAt, null);
});

test('SoundCloud resolves public uploads with OAuth, combines pages and signals missing configuration', async () => {
  const a = { ...artist, soundcloud: 'https://soundcloud.com/artist' };
  const unconfigured = await load({ env: {}, fetchImpl: async () => reply({ data: [] }) });
  const absent = await unconfigured.get([a]);
  assert.equal(absent.sources.find(s => s.provider === 'soundcloud').status, 'not_configured');
  assert.equal(absent.complete, false);
  const calls = [];
  const library = await load({ env: { SOUNDCLOUD_ACCESS_TOKEN: 'private-test-token' }, fetchImpl: async (url, options) => {
    const u = new URL(url); calls.push(u);
    if (u.hostname === 'api.mixcloud.com') { assert.equal(options.headers.Authorization, undefined); return reply({ data: [show('mix', '2023-01-01')] }); }
    assert.equal(options.headers.Authorization, 'OAuth private-test-token');
    if (u.pathname === '/resolve') {
      assert.equal(u.searchParams.get('url'), 'https://soundcloud.com/artist');
      return new Response(null, { status: 302, headers: { location: 'https://api.soundcloud.com/users/soundcloud:users:42' } });
    }
    if (u.pathname === '/users/soundcloud:users:42') return reply({ kind: 'user', urn: 'soundcloud:users:42' });
    assert.equal(u.pathname, '/users/soundcloud%3Ausers%3A42/tracks');
    return reply({ collection: [{ id: 9, title: 'Track', sharing: 'public', permalink_url: 'https://soundcloud.com/artist/track', created_at: '2024-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', duration: 120000, access: 'blocked', embeddable_by: 'none' }, { id: 10, title: 'Private', sharing: 'private', permalink_url: 'https://soundcloud.com/artist/private' }] });
  }});
  const result = await library.get([a]);
  assert.deepEqual(result.items.map(x => x.title), ['Track', 'mix']);
  assert.equal(result.items[0].createdAt, '2024-01-01T00:00:00.000Z');
  assert.equal(result.items[0].playable, false);
  assert.equal(result.items[0].durationSeconds, 120);
  assert.equal(result.complete, true);
});

test('collapses inflight discovery and refreshes stale TTL cache without losing surviving items', async () => {
  let clock = 100000, calls = 0, finish;
  const library = await load({ now: () => clock, ttlMs: 100, fetchImpl: async () => {
    calls++;
    if (calls === 1) { await new Promise(resolve => { finish = resolve; }); return reply({ data: [show('cached', '2020-01-01')] }); }
    throw new Error('private upstream error must never escape');
  }});
  const first = library.get([artist]);
  const second = library.get([artist]);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 1);
  finish();
  const [a, b] = await Promise.all([first, second]);
  assert.deepEqual(a, b);
  assert.equal((await library.get([artist])).cache.stale, false);
  assert.equal(calls, 1);
  clock += 101;
  const stale = await library.get([artist]);
  assert.equal(stale.cache.refreshing, true);
  assert.equal(stale.cache.stale, true);
  await new Promise(resolve => setImmediate(resolve));
  const failed = await library.get([artist]);
  assert.equal(failed.items.length, 1);
  assert.equal(failed.sources[0].status, 'unavailable');
  assert.equal(failed.cache.stale, true);
  assert.equal(failed.complete, false);
  assert.equal(JSON.stringify(failed).includes('private upstream'), false);
  const removed = await library.get([]);
  assert.equal(removed.total, 0);
  const changed = await library.get([{ ...artist, mixcloud: 'https://www.mixcloud.com/other/' }]);
  assert.equal(changed.total, 0);
});

test('bounds global requests, concurrency and hung response bodies without starving status reporting', async () => {
  let active = 0, peak = 0, calls = 0;
  const library = await load({ concurrency: 2, maxRequests: 3, refreshTimeoutMs: 50, requestTimeoutMs: 20, fetchImpl: async (url, options) => {
    active++; calls++; peak = Math.max(peak, active);
    assert.ok(options.signal);
    await new Promise(resolve => setTimeout(resolve, 2));
    active--;
    return reply({ data: [] });
  }});
  const many = Array.from({ length: 12 }, (_, i) => ({ ...artist, id: i + 1, mixcloud: `https://www.mixcloud.com/artist${i}/` }));
  const result = await library.get(many);
  assert.equal(result.sources.length, 12);
  assert.ok(peak <= 2);
  assert.equal(calls, 3);
  assert.equal(result.complete, false);
  const hung = await load({ requestTimeoutMs: 10, refreshTimeoutMs: 30, fetchImpl: async () => new Response(new ReadableStream({ start() {} })) });
  const timeout = await Promise.race([hung.get([artist]), new Promise(resolve => setTimeout(() => resolve(null), 200))]);
  assert.ok(timeout, 'provider response body must time out');
  assert.equal(timeout.sources[0].status, 'unavailable');
});

test('reuses single-flight SoundCloud client credentials token and rotates refresh token on expiry', async () => {
  let clock = 100000, grants = [];
  const library = await load({ now: () => clock, ttlMs: 1, env: { SOUNDCLOUD_CLIENT_ID: 'test-client', SOUNDCLOUD_CLIENT_SECRET: 'test-secret' }, fetchImpl: async (url, options) => {
    if (String(url) === 'https://secure.soundcloud.com/oauth/token') {
      assert.equal(options.method, 'POST');
      const body = new URLSearchParams(options.body);
      grants.push(body.get('grant_type'));
      if (grants.length === 1) {
        assert.equal(options.headers.Authorization, `Basic ${Buffer.from('test-client:test-secret').toString('base64')}`);
        assert.equal(body.has('client_secret'), false);
      } else {
        assert.equal(body.get('refresh_token'), 'refresh-1');
        assert.equal(body.get('client_secret'), 'test-secret');
      }
      return reply({ access_token: `token-${grants.length}`, refresh_token: `refresh-${grants.length}`, expires_in: 3600 });
    }
    assert.equal(options.headers.Authorization, `OAuth token-${grants.length}`);
    if (new URL(url).pathname === '/resolve') return reply({ kind: 'user', id: 42 });
    return reply({ collection: [] });
  }});
  const artists = [1,2].map(id => ({ id, name: 'SC', soundcloud: `https://soundcloud.com/artist${id}` }));
  assert.equal((await library.get(artists)).complete, true);
  assert.deepEqual(grants, ['client_credentials']);
  clock += 3600000;
  await library.get(artists);
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal((await library.get(artists)).complete, true);
  assert.deepEqual(grants, ['client_credentials', 'refresh_token']);
});

test('requests blocked metadata too, follows SoundCloud pagination, and reports preview without promising iframe playback', async () => {
  const calls = [];
  const library = await load({ env: { SOUNDCLOUD_ACCESS_TOKEN: 'token' }, fetchImpl: async url => {
    const u = new URL(url); calls.push(u);
    if (u.pathname === '/resolve') return reply({ kind: 'user', urn: 'soundcloud:users:42' });
    assert.equal(u.searchParams.get('access'), 'playable,preview,blocked');
    assert.equal(u.searchParams.get('sort'), 'desc');
    return reply({ collection: [{ urn: `soundcloud:tracks:${calls.length}`, title: 'Track', permalink_url: `https://soundcloud.com/artist/track${calls.length}`, created_at: '2020-01-01', access: 'preview', streamable: false }], next_href: calls.length === 2 ? 'https://api.soundcloud.com/users/soundcloud%3Ausers%3A42/tracks?limit=100&linked_partitioning=true&access=playable,preview,blocked&sort=desc&cursor=next' : null });
  }});
  const result = await library.get([{ ...artist, mixcloud: '', soundcloud: 'artist' }], { limit: 1 });
  assert.equal(result.total, 2);
  assert.equal(result.nextOffset, 1);
  assert.equal(result.items[0].playable, null);
  assert.equal(result.items[0].providerAccess, 'preview');
  assert.equal(result.items[0].streamable, false);
  assert.equal((await library.get([{ ...artist, mixcloud: '', soundcloud: 'artist' }], { offset: 1, limit: 1 })).nextOffset, null);
  assert.equal(calls.length, 3);
});

test('backs off provider rate limits and bounds stale retention after outages or profile deletion', async () => {
  let clock = 100000, calls = 0, mode = 'ok';
  const library = await load({ env: {}, now: () => clock, ttlMs: 10, maxStaleMs: 100, fetchImpl: async () => {
    calls++;
    if (mode === 'ok') return reply({ data: [show('known', '2020-01-01')] });
    if (mode === 'rate') return new Response(JSON.stringify({ error: { retry_after: 1 } }), { status: 403 });
    return new Response('{}', { status: 404 });
  }});
  await library.get([artist]);
  mode = 'rate'; clock += 11;
  await library.get([artist]); await new Promise(resolve => setImmediate(resolve));
  assert.equal((await library.get([artist])).total, 1);
  clock += 11;
  await library.get([artist]); await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 2, 'do not retry during provider Retry-After');
  clock += 200;
  await library.get([artist]); await new Promise(resolve => setImmediate(resolve));
  assert.equal((await library.get([artist])).total, 0, 'expire old cached public metadata');
  clock += 1000; mode = 'ok';
  await library.get([artist]); await new Promise(resolve => setImmediate(resolve));
  assert.equal((await library.get([artist])).total, 1);
  clock += 11; mode = 'gone';
  await library.get([artist]); await new Promise(resolve => setImmediate(resolve));
  assert.equal((await library.get([artist])).total, 0, 'explicit 404 must discard prior uploads');
});

test('retries SoundCloud unauthorized once with refreshed OAuth and never loops on a second rejection', async () => {
  let tokens = 0, resolves = 0;
  const library = await load({ env: { SOUNDCLOUD_CLIENT_ID: 'client', SOUNDCLOUD_CLIENT_SECRET: 'secret' }, fetchImpl: async url => {
    if (String(url).includes('/oauth/token')) { tokens++; return reply({ access_token: `token${tokens}`, refresh_token: `refresh${tokens}`, expires_in: 3600 }); }
    resolves++; return new Response('{}', { status: 401 });
  }});
  const result = await library.get([{ id: 1, name: 'SC', soundcloud: 'artist' }]);
  assert.equal(result.sources[0].status, 'unavailable');
  assert.equal(tokens, 2);
  assert.equal(resolves, 2);
});

test('keeps unknown dates last and rejects non-provider artwork URLs', async () => {
  const library = await load({ fetchImpl: async () => reply({ data: [
    { ...show('unknown', 'bad-date'), pictures: { large: 'http://127.0.0.1/secret' } },
    { ...show('old', '1960-01-01T00:00:00Z'), pictures: { large: 'https://thumbnailer.mixcloud.com/unsafe?ok' } }
  ] }) });
  const result = await library.get([artist]);
  assert.deepEqual(result.items.map(x => x.title), ['old', 'unknown']);
  assert.equal(result.items[1].artworkUrl, null);
  assert.equal(result.items[0].artworkUrl, 'https://thumbnailer.mixcloud.com/unsafe?ok');
});

test('recovers invalid refresh grants with one client regrant but never regrants after token throttling', async () => {
  for (const status of [400, 429]) {
    let clock = 100000, grants = [];
    const library = await load({ now: () => clock, ttlMs: 1, env: { SOUNDCLOUD_CLIENT_ID: 'client', SOUNDCLOUD_CLIENT_SECRET: 'secret' }, fetchImpl: async (url, options) => {
      if (String(url).includes('/oauth/token')) {
        const grant = new URLSearchParams(options.body).get('grant_type'); grants.push(grant);
        if (grant === 'refresh_token') return new Response(JSON.stringify({ error: 'invalid_grant' }), { status });
        return reply({ access_token: `token-${grants.length}`, refresh_token: 'single-use', expires_in: 120 });
      }
      if (new URL(url).pathname === '/resolve') return reply({ kind: 'user', id: 42 });
      return reply({ collection: [] });
    }});
    const artists = [{ id: 1, name: 'SC', soundcloud: 'artist' }];
    assert.equal((await library.get(artists)).complete, true);
    clock += 120000;
    await library.get(artists); await new Promise(resolve => setImmediate(resolve));
    const result = await library.get(artists);
    assert.equal(result.complete, status === 400);
    assert.deepEqual(grants, status === 400 ? ['client_credentials', 'refresh_token', 'client_credentials'] : ['client_credentials', 'refresh_token']);
  }
});

test('partial refresh never resurrects an upload explicitly marked private', async () => {
  let clock = 100000, privateTrack = false;
  const track = { urn: 'soundcloud:tracks:1', title: 'Public then private', permalink_url: 'https://soundcloud.com/artist/track', created_at: '2020-01-01', sharing: 'public' };
  const library = await load({ now: () => clock, ttlMs: 1, env: { SOUNDCLOUD_ACCESS_TOKEN: 'token' }, fetchImpl: async url => {
    if (new URL(url).pathname === '/resolve') return reply({ kind: 'user', id: 42 });
    return reply({ collection: [{ ...track, sharing: privateTrack ? 'private' : 'public' }], next_href: privateTrack ? 'https://evil.invalid/next' : null });
  }});
  const artists = [{ id: 1, name: 'SC', soundcloud: 'artist' }];
  assert.equal((await library.get(artists)).total, 1);
  privateTrack = true; clock += 2;
  await library.get(artists); await new Promise(resolve => setImmediate(resolve));
  const result = await library.get(artists);
  assert.equal(result.total, 0);
  assert.equal(result.complete, false);
});
