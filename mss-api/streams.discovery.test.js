import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';

function harness({ rows = {}, artists = [], connect, read, dbError, env = {}, timeout = 25 } = {}) {
  const clients = [];
  const options = [];
  const source = readFileSync(new URL('./streams.js', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
  const api = vm.runInNewContext(source + '\n;({ getActiveStreams, getStreamStats, stopDiscovery, getStreamDiscovery: typeof getStreamDiscovery === "function" ? getStreamDiscovery : undefined });', {
    createClient(config) {
      options.push(config);
      const client = new EventEmitter();
      client.isReady = false;
      client.connect = async () => { if (connect) await connect(client); client.isReady = true; };
      client.hGetAll = async key => { assert.equal(key, 'live_streams'); return read ? read(client) : rows; };
      client.destroy = () => { client.destroyed = true; client.isReady = false; };
      client.disconnect = client.destroy;
      clients.push(client);
      return client;
    },
    getDb: async () => {
      if (dbError) throw dbError;
      return () => ({ whereIn: () => ({ select: async () => artists }) });
    },
    process: { env: { STREAM_DISCOVERY_TIMEOUT_MS: String(timeout), ...env } },
    setTimeout, clearTimeout, URL, console: { error() {}, warn() {} }
  });
  return { ...api, clients, options };
}
test('concurrent discovery waits for one ready client with a safe error listener', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  let reads = 0;
  const api = harness({ connect: () => pending, read: client => { assert.equal(client.isReady, true); reads++; return {}; }, env: { REDIS_URL: 'redis://example.invalid:6380/4' } });
  const first = api.getActiveStreams();
  const second = api.getActiveStreams();
  const both = Promise.all([first, second]);
  both.catch(() => {});
  await new Promise(resolve => setTimeout(resolve, 2));
  assert.equal(reads, 0);
  assert.equal(api.clients.length, 1);
  assert.equal(api.clients[0].listenerCount('error'), 1);
  assert.doesNotThrow(() => api.clients[0].emit('error', new Error('private')));
  assert.equal(api.options[0].url, 'redis://example.invalid:6380/4');
  assert.equal(api.options[0].disableOfflineQueue, true);
  assert.equal(api.options[0].socket.reconnectStrategy, false);
  release();
  await Promise.all([first, second]);
  assert.equal(reads, 2);
});

test('stalled Redis operations time out, discard the client, and permit recovery', async () => {
  for (const phase of ['connect', 'read']) {
    let fail = true;
    const failing = harness({ [phase]: () => fail ? new Promise(() => {}) : {} });
    await assert.rejects(Promise.race([
      failing.getActiveStreams(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('test deadline exceeded')), 150))
    ]), { message: 'Stream discovery unavailable' });
    assert.equal(failing.clients[0].destroyed, true);
    fail = false;
    assert.equal((await failing.getActiveStreams()).length, 0);
    assert.equal(failing.clients.length, 2);
  }
});

const row = (extra = {}) => JSON.stringify({ id: 'publisher', startTime: 1700000000000, isPublishing: true, bitrate: 128, ...extra });
const artist = (channel = 'Exact', id = 1) => ({ id, name: 'Artist', slug: 'not-an-ingest-key', channel_name: channel, twitch: '' });

test('healthy SP rows retain exact channels and old start times without fictitious HLS or keys', async () => {
  const api = harness({ rows: { Exact: row() }, artists: [artist()], env: { MEDIA_BASE_URL: 'https://media.example/proxy/' } });
  const streams = await api.getActiveStreams();
  assert.equal(streams.length, 1);
  assert.equal(streams[0].startedAt, '2023-11-14T22:13:20.000Z');
  assert.equal(streams[0].channelName, 'Exact');
  assert.equal(streams[0].playUrl, 'https://media.example/proxy/live/Exact.flv');
  assert.equal('streamKey' in streams[0], false);
  assert.equal('hlsUrl' in streams[0], false);
  const unconfigured = harness({ rows: { Exact: row() }, artists: [artist()] });
  assert.equal('playUrl' in (await unconfigured.getActiveStreams())[0], false);
});

test('malformed rows are isolated with safe partial-discovery metadata', async () => {
  const api = harness({ rows: { Exact: row(), broken: '{', invalid: row({ startTime: null }), infinite: '{"startTime":1e999}', outside: row({ startTime: 9e20 }), array: '[]' },
    artists: [artist(), artist('broken', 2), artist('invalid', 3), artist('infinite', 4), artist('outside', 5), artist('array', 6)] });
  const active = await api.getActiveStreams();
  assert.equal(active.length, 1);
  assert.equal(active[0].channelName, 'Exact');
  const snapshot = await api.getStreamDiscovery();
  assert.equal(snapshot.discovery.degraded, true);
  assert.equal(snapshot.discovery.invalidRows, 5);
  assert.equal(JSON.stringify(snapshot).includes('broken'), false);
  const stats = await api.getStreamStats();
  assert.equal(stats.connected, true);
  assert.equal(stats.activeStreams, 1);
  assert.equal(stats.degraded, true);
});

test('explicit nonpublishing is offline while legacy publishing-flag absence remains compatible', async () => {
  const api = harness({ rows: { Exact: row({ isPublishing: false }), legacy: JSON.stringify({ startTime: 1700000000000 }) }, artists: [artist(), artist('legacy', 2)] });
  const snapshot = await api.getStreamDiscovery();
  assert.equal(snapshot.streams.length, 1);
  assert.equal(snapshot.streams[0].channelName, 'legacy');
  assert.equal(snapshot.discovery.degraded, false);
});

test('ambiguous channel mappings are omitted once and exact own-key matches alone are used', async () => {
  const rows = Object.assign(Object.create({ inherited: row() }), { Exact: row(), duplicate: row() });
  const api = harness({ rows, artists: [artist(), artist('exact', 2), artist(' Exact', 3), artist('inherited', 4), artist('duplicate', 5), artist('duplicate', 6)] });
  const snapshot = await api.getStreamDiscovery();
  assert.equal(snapshot.streams.length, 1);
  assert.equal(snapshot.streams[0].channelName, 'Exact');
  assert.equal(snapshot.discovery.degraded, true);
  assert.equal(snapshot.discovery.duplicateChannels, 1);
  assert.equal(snapshot.discovery.invalidRows, 0);
  assert.equal(Object.keys(rows).length, 2);
});

test('shutdown invalidates in-flight initialization without reviving the retired client', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  let connects = 0;
  const api = harness({ connect: () => ++connects === 1 ? pending : undefined });
  const first = api.getActiveStreams();
  await new Promise(resolve => setTimeout(resolve, 1));
  await api.stopDiscovery();
  const next = api.getActiveStreams();
  release();
  await assert.rejects(first, { message: 'Stream discovery unavailable' });
  assert.equal((await next).length, 0);
  assert.equal(api.clients.length, 2);
  assert.equal(api.clients[0].destroyed, true);
  await api.stopDiscovery();
  await api.stopDiscovery();
});

test('invalid public media configuration never exposes secrets or unsafe URLs', async () => {
  for (const url of ['javascript:alert(1)', 'https://user:secret@media.example', 'https://media.example?secret=1', 'https://media.example/#token', '/relative']) {
    const api = harness({ rows: { Exact: row() }, artists: [artist()], env: { MEDIA_BASE_URL: url } });
    await assert.rejects(api.getActiveStreams(), { message: 'Stream discovery unavailable' });
  }
});

for (const delimiter of ['?', '#']) {
  test(`bare media URL ${delimiter} delimiter is sanitized unavailable`, async () => {
    const api = harness({ rows: { Exact: row() }, artists: [artist()], env: { MEDIA_BASE_URL: `https://media.example/${delimiter}` } });
    await assert.rejects(api.getActiveStreams(), { message: 'Stream discovery unavailable' });
    const stats = await api.getStreamStats();
    assert.equal(stats.connected, false);
    assert.equal(stats.error, 'Stream discovery unavailable');
    assert.equal('activeStreams' in stats, false);
    assert.equal(api.clients.length, 0);
  });
}

test('a lost ready connection is retired before reconnecting on demand', async () => {
  const api = harness();
  await api.getActiveStreams();
  api.clients[0].isReady = false;
  api.clients[0].emit('error', new Error('private endpoint'));
  await api.getActiveStreams();
  assert.equal(api.clients.length, 2);
  assert.equal(api.clients[0].destroyed, true);
});

test('connection and database failures never expose private errors', async () => {
  let fail = true;
  const api = harness({ connect: () => { if (fail) throw new Error('redis://password@private'); } });
  await assert.rejects(api.getActiveStreams(), { message: 'Stream discovery unavailable' });
  assert.equal(api.clients[0].destroyed, true);
  fail = false;
  assert.equal((await api.getActiveStreams()).length, 0);
  const brokenDb = harness({ rows: { Exact: row() }, dbError: new Error('postgres://secret@private') });
  await assert.rejects(brokenDb.getStreamDiscovery(), { message: 'Stream discovery unavailable' });
});

test('healthy offline stats are connected, with a known zero count', async () => {
  const api = harness();
  const stats = await api.getStreamStats();
  assert.equal(stats.connected, true);
  assert.equal(stats.activeStreams, 0);
  assert.equal(stats.degraded, false);
  assert.equal(stats.invalidRows, 0);
  assert.equal(stats.duplicateChannels, 0);
});

test('media channel components are encoded rather than interpreted as URL syntax', async () => {
  const channel = 'Exact /?#';
  const api = harness({ rows: { [channel]: row() }, artists: [artist(channel)], env: { MEDIA_BASE_URL: 'https://media.example/' } });
  assert.equal((await api.getActiveStreams())[0].playUrl, 'https://media.example/live/Exact%20%2F%3F%23.flv');
});

test('read failure is sanitized unavailable, not healthy offline', async () => {
  const api = harness({ read: () => { throw new Error('redis://secret@private'); } });
  await assert.rejects(api.getActiveStreams(), { message: 'Stream discovery unavailable' });
  const stats = await api.getStreamStats();
  assert.equal(stats.connected, false);
  assert.equal(stats.error, 'Stream discovery unavailable');
});

test('late connect after timeout cannot replace the recovered client or read Redis', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  let connects = 0;
  const readers = [];
  const api = harness({ connect: () => ++connects === 1 ? pending : undefined,
    read: client => { readers.push(client); return {}; } });
  await assert.rejects(api.getActiveStreams(), { message: 'Stream discovery unavailable' });
  assert.equal(api.clients[0].destroyed, true);
  await api.getActiveStreams();
  const recovered = api.clients[1];
  release();
  await new Promise(resolve => setImmediate(resolve));
  await api.getActiveStreams();
  assert.equal(api.clients.length, 2);
  assert.deepEqual(readers, [recovered, recovered]);
  assert.equal(recovered.destroyed, undefined);
  await api.stopDiscovery();
});

test('shutdown before deferred connect prevents the retired attempt from becoming current', async () => {
  let connects = 0;
  const readers = [];
  const api = harness({ connect: () => { connects++; }, read: client => { readers.push(client); return {}; } });
  const first = api.getActiveStreams();
  const rejection = assert.rejects(first, { message: 'Stream discovery unavailable' });
  assert.equal(connects, 0);
  const stopped = api.stopDiscovery();
  assert.equal(api.clients[0].destroyed, true);
  const next = api.getActiveStreams();
  await Promise.all([stopped, rejection, next]);
  await api.getActiveStreams();
  assert.equal(api.clients.length, 2);
  assert.deepEqual(readers, [api.clients[1], api.clients[1]]);
  assert.equal(api.clients[1].destroyed, undefined);
  await api.stopDiscovery();
});

test('Redis connect timeout defaults for invalid configuration and caps positive values', async () => {
  for (const [configured, expected] of [[undefined, 2000], ['', 2000], ['0', 2000], ['-1', 2000],
    ['invalid', 2000], ['Infinity', 2000], ['250', 250], ['10000', 10000], ['10001', 10000]]) {
    const api = harness({ env: { STREAM_DISCOVERY_TIMEOUT_MS: configured } });
    await api.getActiveStreams();
    assert.equal(api.options[0].socket.connectTimeout, expected, String(configured));
    await api.stopDiscovery();
  }
});

test('percent-encoded delimiters in a media base path remain valid path data', async () => {
  const api = harness({ rows: { Exact: row() }, artists: [artist()],
    env: { MEDIA_BASE_URL: 'https://media.example/proxy%3F%23/' } });
  assert.equal((await api.getActiveStreams())[0].playUrl, 'https://media.example/proxy%3F%23/live/Exact.flv');
  await api.stopDiscovery();
});
