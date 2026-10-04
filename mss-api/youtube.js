// Explicit public videos only; no channel discovery, scraping, DB or startup.
export const YOUTUBE_LINK_LIMIT = 100;
export function createYouTubeMetadata({ env = process.env, fetchImpl = globalThis.fetch, timeoutMs = 5000 } = {}) {
  return { configured: () => Boolean(env.YOUTUBE_API_KEY), async get(value) {
    const parsed = parseYouTubeUrl(value);
    if (!env.YOUTUBE_API_KEY) throw fail('not_configured', 'YouTube video additions are unavailable: the server needs YOUTUBE_API_KEY.', 503);
    const controller = new AbortController(); let reader, timer;
    try {
      const data = await Promise.race([
        new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reader?.cancel().catch(() => {}); reject(new Error('timeout')); }, timeoutMs); }),
        (async () => {
          const query = new URLSearchParams({ part: 'snippet,contentDetails,status', id: parsed.videoId });
          // Credentials stay in server-side headers, not browser DTOs or URL logs.
          const response = await fetchImpl(`https://www.googleapis.com/youtube/v3/videos?${query}`, { headers: { Accept: 'application/json', 'X-Goog-Api-Key': env.YOUTUBE_API_KEY }, redirect: 'error', signal: controller.signal });
          if (!response.ok || Number(response.headers.get('content-length')) > 262144) { await response.body?.cancel(); throw new Error('response'); }
          reader = response.body?.getReader(); if (!reader) throw new Error('body');
          let size = 0; const chunks = [];
          while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 262144) { await reader.cancel(); throw new Error('size'); } chunks.push(Buffer.from(value)); }
          return JSON.parse(Buffer.concat(chunks).toString('utf8'));
        })()
      ]);
      const row = data?.items?.find(item => item?.id === parsed.videoId);
      if (!row || !['public', 'unlisted'].includes(row.status?.privacyStatus) || row.status?.uploadStatus !== 'processed') throw fail('unavailable_video', 'Video is private, deleted, unavailable or not yet processed.', 422);
      if (row.status.embeddable !== true) throw fail('embedding_disabled', 'This video does not allow embedding on MSS.', 422);
      if (row.snippet?.liveBroadcastContent !== 'none') throw fail('not_published', 'Add this video after the live stream or premiere has ended and its recording is published.', 422);
      const published = row.snippet.publishedAt;
      const dateParts = typeof published === 'string' && /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.exec(published);
      const calendarDate = dateParts && new Date(`${dateParts[1]}-${dateParts[2]}-${dateParts[3]}T00:00:00Z`);
      const validCalendar = calendarDate && Number.isFinite(calendarDate.getTime()) && calendarDate.toISOString().slice(0,10) === published.slice(0,10);
      const duration = /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(row.contentDetails?.duration || '');
      const seconds = duration && Number(duration[1] || 0)*86400 + Number(duration?.[2] || 0)*3600 + Number(duration?.[3] || 0)*60 + Number(duration?.[4] || 0);
      if (!validCalendar || !Number.isFinite(Date.parse(published)) || Date.parse(published) > Date.now() || typeof row.snippet.title !== 'string' || !row.snippet.title.trim() || row.snippet.title.length > 200 || !duration || !Number.isFinite(seconds) || seconds <= 0) throw fail('invalid_metadata', 'YouTube did not provide a valid published date, title and duration.', 422);
      let thumbnail = null;
      for (const key of ['maxres','standard','high','medium','default']) {
        try { const url = new URL(row.snippet.thumbnails?.[key]?.url); if (url.protocol === 'https:' && ['i.ytimg.com','i9.ytimg.com'].includes(url.hostname) && !url.username && !url.password && !url.port) { thumbnail = url.href; break; } } catch { /* optional artwork */ }
      }
      return { ...parsed, title: row.snippet.title, publishedAt: new Date(published).toISOString(), durationSeconds: seconds, artworkUrl: thumbnail };
    } catch (error) {
      if (error.status) throw error;
      throw fail('provider_unavailable', 'YouTube metadata is unavailable. Try again later; no link was saved.', 503);
    } finally { clearTimeout(timer); }
  } };
}
export const youtubeMetadata = createYouTubeMetadata();
export function youtubeVideoDto(row, artist) {
  return { id: `youtube:${row.video_id}`, videoId: row.video_id, provider: 'youtube', platform: 'YouTube', artistId: artist.id, artistName: artist.name, artistImage: artist.profile_picture || null, title: row.title, url: `https://www.youtube.com/watch?v=${row.video_id}`, artworkUrl: row.artwork_url, durationSeconds: row.duration_seconds, createdAt: new Date(row.published_at).toISOString(), metadataFetchedAt: new Date(row.fetched_at).toISOString(), playable: true, providerAccess: 'playable' };
}
const fail = (code, message, status = 400) => Object.assign(new Error(message), { code, status });
export function parseYouTubeUrl(value) {
  const invalid = () => fail('invalid_url', 'Use a supported HTTPS YouTube video URL.');
  if (typeof value !== 'string' || value.length > 2048 || /[\\\s]/.test(value.trim())) throw invalid();
  let url;
  try { url = new URL(value.trim()); } catch { throw invalid(); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) throw invalid();
  let videoId;
  if (url.hostname === 'youtu.be') videoId = /^\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname)?.[1];
  else if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname)) {
    if (url.pathname === '/watch' && url.searchParams.getAll('v').length === 1) videoId = url.searchParams.get('v');
    else videoId = /^\/(?:shorts|live|embed)\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname)?.[1];
  }
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId || '')) throw invalid();
  return { videoId, url: `https://www.youtube.com/watch?v=${videoId}` };
}
