import { createClient } from 'redis';
import { getDb } from './db.js';

let globalRedisClient = null;
let initialization = null;
const configuredTimeout = Number(process.env.STREAM_DISCOVERY_TIMEOUT_MS);
const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0
  ? Math.min(configuredTimeout, 10000) : 2000;

function discard(client) {
  if (globalRedisClient === client) globalRedisClient = null;
  try { client.destroy(); } catch { /* Already closed. */ }
}

async function bounded(operation, client) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Stream discovery unavailable')), timeoutMs);
      })
    ]);
  } catch {
    if (client) discard(client);
    throw new Error('Stream discovery unavailable');
  } finally {
    clearTimeout(timer);
  }
}

async function getRedis() {
  if (initialization) return initialization;
  if (globalRedisClient?.isReady) return globalRedisClient;
  if (globalRedisClient) discard(globalRedisClient);
  const client = createClient({
    ...(process.env.REDIS_URL ? { url: process.env.REDIS_URL } : {}),
    disableOfflineQueue: true,
    socket: { reconnectStrategy: false, connectTimeout: timeoutMs }
  });
  // Never log transport errors: URLs and credentials can occur in messages.
  client.on('error', () => {});
  globalRedisClient = client;
  const attempt = bounded(async () => {
    await client.connect();
    if (globalRedisClient !== client || !client.isReady) {
      throw new Error('Stream discovery unavailable');
    }
    return client;
  }, client).finally(() => {
    if (initialization === attempt) initialization = null;
  });
  initialization = attempt;
  return attempt;
}

/**
 * Discovers active streams by cross-referencing external streaming-platform 
 * data in Redis with MSS Artist metadata in PostgreSQL.
 */
export async function getStreamDiscovery() {
  try {
    let mediaBase;
    if (process.env.MEDIA_BASE_URL) {
      const url = new URL(process.env.MEDIA_BASE_URL);
      // search/hash hide bare delimiters; href retains them (not encoded path data).
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || /[?#]/.test(url.href)) {
        throw new Error('Invalid media configuration');
      }
      mediaBase = url.href.replace(/\/+$/, '');
    }
    const redis = await getRedis();
    // The external streaming-platform uses 'live_streams' hash where key is channelName
    const liveStreams = await bounded(() => redis.hGetAll('live_streams'), redis);
    const channelNames = Object.keys(liveStreams);
    
    const discovery = { degraded: false, invalidRows: 0, duplicateChannels: 0 };
    if (channelNames.length === 0) return { streams: [], discovery };

    const db = await getDb();
    const artists = await db('artists')
      .whereIn('channel_name', channelNames)
      .select('id', 'name', 'channel_name', 'twitch', 'profile_picture');
    
    const mappings = new Map();
    for (const artist of artists) {
      const channel = artist.channel_name;
      if (typeof channel !== 'string' || !Object.hasOwn(liveStreams, channel)) continue;
      if (!mappings.has(channel)) mappings.set(channel, []);
      mappings.get(channel).push(artist);
    }
    const streams = [];
    for (const [channel, matches] of mappings) {
      // Do not pick an arbitrary owner for an ambiguous channel.
      if (matches.length > 1) {
        discovery.duplicateChannels++;
        discovery.degraded = true;
        continue;
      }
      const artist = matches[0];
      let liveData;
      try {
        liveData = JSON.parse(liveStreams[channel]);
        if (!liveData || Array.isArray(liveData) || typeof liveData !== 'object' ||
            typeof liveData.startTime !== 'number' || !Number.isFinite(liveData.startTime) ||
            !Number.isFinite(new Date(liveData.startTime).getTime())) throw new Error('Invalid row');
      } catch {
        discovery.invalidRows++;
        discovery.degraded = true;
        continue;
      }
      if (liveData.isPublishing === false) continue;
      // startTime is not a heartbeat: never expire a long-running publisher by age.
      streams.push({
        artistId: artist.id,
        artistName: artist.name,
        artistImage: artist.profile_picture || null,
        channelName: channel,
        startedAt: new Date(liveData.startTime).toISOString(),
        ...(mediaBase ? {
          playUrl: `${mediaBase}/live/${encodeURIComponent(channel)}.flv`
        } : {}),
        twitchUrl: artist.twitch ? `https://www.twitch.tv/${artist.twitch.trim()}` : ''
      });
    }

    return { streams, discovery };
  } catch {
    throw new Error('Stream discovery unavailable');
  }
}

export async function getActiveStreams() {
  return (await getStreamDiscovery()).streams;
}

/**
 * Returns simple stats about the connection to the streaming infrastructure.
 */
export async function getStreamStats() {
  try {
    const { streams, discovery } = await getStreamDiscovery();
    return {
      connected: true,
      activeStreams: streams.length,
      ...discovery
    };
  } catch {
    return { connected: false, error: 'Stream discovery unavailable' };
  }
}

/**
 * Closes only this discovery client immediately; never stops or mutates Redis.
 */
export async function stopDiscovery() {
  initialization = null;
  if (globalRedisClient) discard(globalRedisClient);
}
