import { createClient } from 'redis';
import { getDb } from './db.js';

let globalRedisClient = null;

/**
 * Initializes the Redis client if not already connected.
 */
async function getRedis() {
  if (!globalRedisClient) {
    globalRedisClient = createClient();
    await globalRedisClient.connect();
  }
  return globalRedisClient;
}

/**
 * Discovers active streams by cross-referencing external streaming-platform 
 * data in Redis with MSS Artist metadata in PostgreSQL.
 */
export async function getActiveStreams() {
  const redis = await getRedis();
  
  try {
    // The external streaming-platform uses 'live_streams' hash where key is channelName
    const liveStreams = await redis.hGetAll('live_streams');
    const channelNames = Object.keys(liveStreams);
    
    if (channelNames.length === 0) return [];

    const db = await getDb();
    const artists = await db('artists')
      .whereIn('channel_name', channelNames)
      .select('id', 'name', 'slug', 'channel_name', 'twitch');
    
    const streams = artists.map(artist => {
      const liveData = JSON.parse(liveStreams[artist.channel_name]);
      return {
        artistId: artist.id,
        artistName: artist.name,
        channelName: artist.channel_name,
        streamKey: artist.slug,
        startedAt: new Date(liveData.startTime).toISOString(),
        // URLs are constructed to point to the external platform's media server
        playUrl: `http://localhost:8000/live/${artist.channel_name}.flv`,
        hlsUrl: `http://localhost:8000/live/${artist.channel_name}/index.m3u8`,
        twitchUrl: artist.twitch ? `https://www.twitch.tv/${artist.twitch.trim()}` : ''
      };
    });

    return streams;
  } catch (err) {
    console.error('[Streams] Error fetching active streams from external platform:', err);
    return [];
  }
}

/**
 * Returns simple stats about the connection to the streaming infrastructure.
 */
export async function getStreamStats() {
  try {
    const active = await getActiveStreams();
    return {
      connected: true,
      activeStreams: active.length
    };
  } catch (err) {
    return { connected: false, error: 'Redis connection error' };
  }
}

/**
 * Gracefully shuts down the discovery connection.
 */
export async function stopDiscovery() {
  if (globalRedisClient) {
    await globalRedisClient.disconnect();
    globalRedisClient = null;
  }
}
