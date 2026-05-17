import NodeMediaServer from 'node-media-server';
import { createClient } from 'redis';
import { spawn } from 'child_process';
import { getDb } from './db.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REDIS_KEY = 'mss:active_streams';
const activeRelays = new Map(); // artistId -> childProcess
const activeSessions = new Map(); // id -> sessionInfo
const recordingsPath = path.join(__dirname, 'recordings');

const rtmpPort = process.env.RTMP_PORT || 1935;
const httpPort = process.env.HTTP_PORT || 8000;

const config = {
  logType: 3,
  rtmp: {
    port: Number(rtmpPort),
    chunk_size: 60000,
    gop_cache: true,
    ping: 30,
    ping_timeout: 60,
    app: {
        live: {
            mode: 'record',
            record_path: recordingsPath,
        }
    }
  },
  http: {
    port: Number(httpPort),
    allow_origin: '*',
    mediaroot: path.join(__dirname, 'media'),
    hls: true
  },
  trans: {
    ffmpeg: 'ffmpeg',
    tasks: [
      {
        app: 'live',
        hls: true,
        hlsFlags: '[hls_time=2:hls_list_size=3:hls_flags=delete_segments]',
      }
    ]
  }
};

let nmsInstance = null;
let globalRedisClient = null;

export async function stopRtmpServer() {
  console.log('[RTMP] Shutting down...');
  for (const [artistId, process] of activeRelays.entries()) {
    process.kill();
  }
  activeRelays.clear();
  activeSessions.clear();
  if (nmsInstance) {
    nmsInstance.stop();
    nmsInstance = null;
  }
  if (globalRedisClient) {
    try {
      await globalRedisClient.del(REDIS_KEY);
      await globalRedisClient.disconnect();
    } catch (err) {}
    globalRedisClient = null;
  }
}

async function startStreamRelay(artist, streamPath) {
  const artistId = artist.id;
  const channelSlug = artist.slug;
  const hlsPath = path.join(__dirname, 'media', 'live', channelSlug);
  
  if (!fs.existsSync(hlsPath)) {
    fs.mkdirSync(hlsPath, { recursive: true });
  }

  console.log(`[Relay] Starting Relay for ${artist.name} to Twitch and HLS...`);
  
  const ffmpegArgs = [
    '-re',
    '-i', `rtmp://127.0.0.1:${rtmpPort}${streamPath}`,
    ...(artist.twitch_stream_key ? [
        '-c:v', 'copy',
        '-c:a', 'aac', '-ar', '44100', '-ab', '128k',
        '-f', 'flv', `rtmp://live.twitch.tv/app/${artist.twitch_stream_key.trim()}`
    ] : []),
    '-c:v', 'copy', 
    '-c:a', 'aac', '-ar', '44100', '-ab', '128k',
    '-f', 'hls',
    '-hls_time', '2',
    '-hls_list_size', '3',
    '-hls_flags', 'delete_segments',
    path.join(hlsPath, 'index.m3u8')
  ];
  
  console.log('[Relay] FFmpeg Args:', ffmpegArgs);

  const ffmpeg = spawn('ffmpeg', ffmpegArgs);

  ffmpeg.on('close', (code) => {
    console.log(`[Relay] Relay for ${artist.name} closed with code ${code}`);
    activeRelays.delete(artistId);
    try {
        fs.rmSync(hlsPath, { recursive: true, force: true });
    } catch (err) {}
  });

  ffmpeg.stderr.on('data', (data) => {
    console.log(`[FFMPEG ${artist.name}] ${data.toString()}`);
  });
}

export async function getRtmpStats() {
  try {
    const activeStreams = await getActiveStreams();
    const stats = {
      uptime: process.uptime(),
      activeSessions: activeStreams.length, 
      rtmpCount: 0,
      flvCount: 0, 
      relayCount: activeRelays.size,
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage()
    };
    
    return stats;
  } catch (err) {
    console.error('[RTMP] Stats Calculation Error:', err);
    return { error: 'Internal stats error' };
  }
}

export async function startRtmpServer() {
  globalRedisClient = createClient();
  await globalRedisClient.connect();
  await globalRedisClient.del(REDIS_KEY);

  const mediaPath = path.join(__dirname, 'media');
  if (fs.existsSync(mediaPath)) {
    fs.rmSync(mediaPath, { recursive: true, force: true });
  }
  fs.mkdirSync(mediaPath, { recursive: true });

  if (!fs.existsSync(recordingsPath)) {
    fs.mkdirSync(recordingsPath, { recursive: true });
  }

  nmsInstance = new NodeMediaServer(config);

  nmsInstance.on('doneConnect', (id, args) => {
    activeSessions.delete(id.id || id);
  });

  nmsInstance.on('prePublish', async (id, StreamPath, args) => {
    console.log('[RTMP] prePublish event triggered.');
    const actualPath = StreamPath || id.streamPath;
    if (!actualPath) return;

    const parts = actualPath.split('/').filter(Boolean);
    if (parts[0] !== 'live' || parts.length < 3) {
        if (id.stop) id.stop();
        return;
    }

    const channelSlug = parts[1];
    const guidKey = parts[2];

    const db = await getDb();
    const artist = await db.get('SELECT * FROM artists WHERE slug = ?', channelSlug);
    await db.close();

    if (!artist || artist.stream_key !== guidKey) {
      if (id.stop) id.stop();
      return;
    }

    activeSessions.set(id.id || id, { type: 'rtmp', path: actualPath, isPublisher: true, artist: artist, startedAt: Date.now() });

    if (globalRedisClient) {
      await globalRedisClient.sAdd(REDIS_KEY, channelSlug);
      await globalRedisClient.hSet(`mss:stream:${channelSlug}`, {
        id: id.id || id,
        artistId: artist.id,
        artistName: artist.name,
        twitchUrl: artist.twitch ? `https://www.twitch.tv/${artist.twitch.trim()}` : '',
        startedAt: new Date().toISOString(),
        path: actualPath,
        playUrl: `http://localhost:${httpPort}${actualPath}.flv`,
        hlsUrl: `http://localhost:4000/media/live/${channelSlug}/index.m3u8`
      });
    }

    setTimeout(() => {
      startStreamRelay(artist, actualPath);
    }, 2000);
  });

  nmsInstance.on('donePublish', async (id, StreamPath, args) => {
    const actualPath = StreamPath || id.streamPath;
    if (!actualPath) return;

    const session = activeSessions.get(id.id || id);
    activeSessions.delete(id.id || id);

    const parts = actualPath.split('/').filter(Boolean);
    const channelSlug = parts[1];

    if (session && session.isPublisher && session.artist) {
        const recordedFilePath = path.join(recordingsPath, actualPath + '.flv');
        if (fs.existsSync(recordedFilePath)) {
            const db = await getDb();
            await db.run(
                'INSERT INTO recordings (artist_id, slug, path, duration) VALUES (?, ?, ?, ?)',
                session.artist.id,
                channelSlug,
                actualPath + '.flv', // Save the .flv path
                (Date.now() - session.startedAt) / 1000
            );
            await db.close();
        }
    }
    
    if (channelSlug && globalRedisClient) {
      const streamInfo = await globalRedisClient.hGetAll(`mss:stream:${channelSlug}`);
      if (streamInfo && streamInfo.artistId) {
        const artistId = Number(streamInfo.artistId);
        if (activeRelays.has(artistId)) {
          activeRelays.get(artistId).kill();
          activeRelays.delete(artistId);
        }
      }
      await globalRedisClient.sRem(REDIS_KEY, channelSlug);
      await globalRedisClient.del(`mss:stream:${channelSlug}`);
    }
  });

  nmsInstance.on('prePlay', (id, StreamPath, args) => {
    const actualPath = StreamPath || id.streamPath;
    const type = actualPath.includes('.flv') || id.constructor.name.includes('Flv') ? 'flv' : 'rtmp';
    activeSessions.set(id.id || id, { type, path: actualPath, isPublisher: false });
  });

  nmsInstance.on('donePlay', (id, StreamPath, args) => {
    activeSessions.delete(id.id || id);
  });

  nmsInstance.run();
  return nmsInstance;
}

export async function getActiveStreams() {
  if (!globalRedisClient) return [];
  const keys = await globalRedisClient.sMembers(REDIS_KEY);
  const streams = [];
  for (const key of keys) {
    const info = await globalRedisClient.hGetAll(`mss:stream:${key}`);
    if (info && info.artistName) {
        streams.push({ streamKey: key, ...info });
    }
  }
  return streams;
}
