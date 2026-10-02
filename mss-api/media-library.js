// Public metadata only. No DB, startup, or environment-loading side effects.
const PROVIDERS = ['mixcloud', 'soundcloud'];
const iso = value => Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
const uploadTime = value => value === null ? -Infinity : Date.parse(value);
function artwork(value, provider) {
  try {
    const url = new URL(value);
    const domains = provider === 'soundcloud' ? ['sndcdn.com'] : ['mixcloud.com', 'mixcloudusercontent.com', 'mixcdn.com'];
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && domains.some(domain => url.hostname === domain || url.hostname.endsWith(`.${domain}`)) ? url.href : null;
  } catch { return null; }
}
function profile(value, provider) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const raw = value.trim();
  const url = new URL(/^[\w-]+$/.test(raw) ? `https://${provider}.com/${raw}/` : raw);
  if (url.protocol !== 'https:' || ![`${provider}.com`, `www.${provider}.com`].includes(url.hostname) || url.port || url.username || url.password || url.search || url.hash || !/^\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)) throw new Error('invalid_profile');
  const handle = url.pathname.split('/')[1];
  return { handle, url: `https://${provider === 'mixcloud' ? 'www.' : ''}${provider}.com/${handle}${provider === 'mixcloud' ? '/' : ''}` };
}
function apiUrl(value, provider, pathname) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== `api.${provider}.com` || url.port || url.username || url.password || url.hash || url.pathname !== pathname) throw new Error('unsafe_url');
  return url.href;
}
function contentUrl(value, provider) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || ![`${provider}.com`, `www.${provider}.com`].includes(url.hostname) || url.username || url.password || url.port || !/^\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)) return null;
    return `${url.origin}${url.pathname}`;
  } catch { return null; }
}
const messages = { ok: 'Public uploads retrieved.', partial: 'Discovery incomplete: provider pagination, response, or safety limit reached.', unavailable: 'Provider unavailable; please try again later.', invalid_profile: 'Link a valid HTTPS provider profile URL or username.', not_configured: 'SoundCloud API access is not configured on the server.' };
export function createMediaLibrary({ fetchImpl = globalThis.fetch, now = Date.now, maxPages = 20, env = process.env, ttlMs = 15 * 60 * 1000, concurrency = 4, maxRequests = 100, refreshTimeoutMs = 8000, requestTimeoutMs = 2500, maxStaleMs = 6 * 60 * 60 * 1000 } = {}) {
  const cooldowns = new Map();
  async function request(url, headers, budget, resolve = false, options = {}, retried = false) {
    const origin = new URL(url).origin;
    if (now() < (cooldowns.get(origin) || 0)) throw new Error('rate_limit');
    if (budget.remaining-- <= 0 || Date.now() >= budget.deadline) throw new Error('budget');
    const controller = new AbortController();
    let reader, timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => { controller.abort(); if (reader) reader.cancel().catch(() => {}); reject(new Error('timeout')); }, Math.min(requestTimeoutMs, budget.deadline - Date.now()));
    });
    try {
      return await Promise.race([timeout, (async () => {
        const response = await fetchImpl(url, { ...options, redirect: 'manual', headers, signal: controller.signal });
        if (resolve && response.status === 302) { await response.body?.cancel(); return { redirect: response.headers.get('location') }; }

        if (Number(response.headers.get('content-length')) > 1024 * 1024) { await response.body?.cancel(); throw new Error('size'); }
        reader = response.body?.getReader();
        if (!reader) throw new Error('invalid_response');
        const chunks = []; let size = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 1024 * 1024) { await reader.cancel(); throw new Error('size'); }
          chunks.push(Buffer.from(value));
        }
        let data;
        try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
        catch { if (response.ok) throw new Error('invalid_response'); }
        if (!response.ok) {
          const retry = response.headers.get('retry-after');
          const seconds = retry && Number.isFinite(Number(retry)) ? Number(retry) : retry ? (Date.parse(retry) - now()) / 1000 : Number(data?.error?.retry_after);
          if (response.status === 429 || (response.status === 403 && Number.isFinite(seconds))) cooldowns.set(origin, now() + Math.max(1, Number.isFinite(seconds) ? seconds : 900) * 1000);
          const error = new Error('provider_error'); error.status = response.status;
          if (data?.error === 'invalid_grant') error.category = 'invalid_grant';
          throw error;
        }
        return data;
      })()]);
    } catch (error) {
      if (error.status === 401 && origin === 'https://api.soundcloud.com' && !env.SOUNDCLOUD_ACCESS_TOKEN && token?.refresh) {
        if (retried) { tokenRetryAt = now() + 15 * 60 * 1000; token.expires = 0; }
        else {
          clearTimeout(timer);
          if (headers.Authorization === `OAuth ${token.access}`) token.expires = 0;
          const access = await soundcloudToken(budget);
          return request(url, { ...headers, Authorization: `OAuth ${access}` }, budget, resolve, options, true);
        }
      }
      throw error;
    } finally { clearTimeout(timer); }
  }
  let token, tokenFlight, tokenRetryAt = 0, regrantAt = 0;
  async function soundcloudToken(budget) {
    if (env.SOUNDCLOUD_ACCESS_TOKEN) return env.SOUNDCLOUD_ACCESS_TOKEN;
    if (token && now() < token.expires) return token.access;
    if (tokenFlight) return tokenFlight;
    if (now() < tokenRetryAt) throw new Error('token_backoff');
    tokenFlight = (async () => {
      const headers = { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' };
      const body = new URLSearchParams();
      if (token?.refresh) {
        body.set('grant_type', 'refresh_token');
        body.set('client_id', env.SOUNDCLOUD_CLIENT_ID);
        body.set('client_secret', env.SOUNDCLOUD_CLIENT_SECRET);
        body.set('refresh_token', token.refresh);
      } else {
        body.set('grant_type', 'client_credentials');
        headers.Authorization = `Basic ${Buffer.from(`${env.SOUNDCLOUD_CLIENT_ID}:${env.SOUNDCLOUD_CLIENT_SECRET}`).toString('base64')}`;
      }
      try {
        let result;
        try {
          result = await request('https://secure.soundcloud.com/oauth/token', headers, budget, false, { method: 'POST', body: body.toString() });
        } catch (error) {
          if (body.get('grant_type') !== 'refresh_token' || ![400, 401].includes(error.status) || error.category !== 'invalid_grant') throw error;
          token = null; // A consumed/revoked refresh token must never be replayed forever.
          if (now() < regrantAt) throw error;
          regrantAt = now() + 15 * 60 * 1000;
          const regrantHeaders = { ...headers, Authorization: `Basic ${Buffer.from(`${env.SOUNDCLOUD_CLIENT_ID}:${env.SOUNDCLOUD_CLIENT_SECRET}`).toString('base64')}` };
          result = await request('https://secure.soundcloud.com/oauth/token', regrantHeaders, budget, false, { method: 'POST', body: 'grant_type=client_credentials' });
        }
        if (typeof result.access_token !== 'string' || !result.access_token || !Number.isFinite(result.expires_in) || result.expires_in <= 0) throw new Error('invalid_token');
        token = { access: result.access_token, refresh: result.refresh_token, expires: now() + Math.max(1, result.expires_in - 60) * 1000 };
        return token.access;
      } catch (error) { tokenRetryAt = now() + 15 * 60 * 1000; throw error; }
    })().finally(() => { tokenFlight = null; });
    return tokenFlight;
  }
  async function soundcloudPath(parsed, headers, budget) {
    const response = await request(`https://api.soundcloud.com/resolve?url=${encodeURIComponent(parsed.url)}`, headers, budget, true);
    let user;
    if (response.redirect) {
      const target = response.redirect;
      const pathname = new URL(target).pathname;
      if (!/^\/users\/(?:[0-9]+|soundcloud(?::|%3A)users(?::|%3A)[0-9]+)$/.test(pathname)) throw new Error('unsafe_url');
      user = await request(apiUrl(target, 'soundcloud', pathname), headers, budget);
    } else {
      user = response;
    }
    const id = user.urn || String(user.id || '');
    if (user.kind !== 'user' || !/^(?:[0-9]+|soundcloud:users:[0-9]+)$/.test(id)) throw new Error('invalid_response');
    return `/users/${encodeURIComponent(id)}/tracks`;
  }
  async function discover(artist, provider, budget) {
    let parsed;
    const items = new Map(), hidden = new Set();
    const source = { artistId: artist.id, artistName: artist.name, provider, profileUrl: null, status: 'ok', complete: true, fetchedAt: null };
    try { parsed = profile(artist[provider], provider); source.profileUrl = parsed.url; }
    catch { source.status = 'invalid_profile'; }
    if (parsed && provider === 'soundcloud' && !env.SOUNDCLOUD_ACCESS_TOKEN && !(env.SOUNDCLOUD_CLIENT_ID && env.SOUNDCLOUD_CLIENT_SECRET)) source.status = 'not_configured';
    if (parsed && source.status === 'ok') {
      const headers = { Accept: 'application/json' };
      const seen = new Set();
      try {
        if (provider === 'soundcloud') headers.Authorization = `OAuth ${await soundcloudToken(budget)}`;
        const pathname = provider === 'mixcloud' ? `/${parsed.handle}/cloudcasts/` : await soundcloudPath(parsed, headers, budget);
        let next = `https://api.${provider}.com${pathname}?limit=100&${provider === 'mixcloud' ? 'offset=0' : 'linked_partitioning=true&access=playable,preview,blocked&sort=desc'}`;
        while (next) {
          next = apiUrl(next, provider, pathname);
          if (seen.has(next) || seen.size >= maxPages) { source.status = 'partial'; break; }
          seen.add(next);
          const page = await request(next, headers, budget);
          const rows = provider === 'mixcloud' ? page.data : page.collection;
          if (!Array.isArray(rows)) throw new Error('invalid_response');
          for (const row of rows) {
            if (provider === 'soundcloud' && row?.sharing === 'private') {
              hidden.add(`soundcloud:${row.urn || row.id}`);
              items.delete(`soundcloud:${row.urn || row.id}`);
              continue;
            }
            const url = provider === 'mixcloud' ? contentUrl(`https://www.mixcloud.com${row?.key}`, provider) : contentUrl(row?.permalink_url, provider);
            const key = provider === 'mixcloud' ? row?.key : row?.urn || row?.id;
            const title = provider === 'mixcloud' ? row?.name : row?.title;
            if (!url || !key || typeof title !== 'string') { source.status = 'partial'; continue; }
            const id = `${provider}:${key}`;
            items.set(id, { id, provider, platform: provider === 'mixcloud' ? 'Mixcloud' : 'SoundCloud', artistId: artist.id, artistName: artist.name, artistImage: artist.profile_picture || null, title, url, artworkUrl: artwork(provider === 'mixcloud' ? row.pictures?.large : row.artwork_url, provider), createdAt: iso(provider === 'mixcloud' ? row.created_time : row.created_at), durationSeconds: provider === 'mixcloud' ? row.audio_length ?? null : Number.isFinite(row.duration) ? row.duration / 1000 : null, playable: provider === 'soundcloud' && row.embeddable_by === 'none' ? false : null, providerAccess: ['playable', 'preview', 'blocked'].includes(row.access) ? row.access : null, streamable: typeof row.streamable === 'boolean' ? row.streamable : null });
          }
          next = provider === 'mixcloud' ? page.paging?.next : page.next_href;
        }
        source.fetchedAt = new Date(now()).toISOString();
      } catch (error) { source.status = items.size ? 'partial' : 'unavailable'; if (error.status === 404) source.reason = 'not_found'; }
    }
    source.complete = source.status === 'ok';
    source.message = messages[source.status];
    source.itemCount = items.size;
    return { items: [...items.values()], source, hidden };
  }
  let entry;
  const sourceKey = (a, p) => JSON.stringify([a.id, p, a[p]]);
  function refresh(state, artists) {
    const previous = state.results || new Map();
    state.inflight = (async () => {
      const jobs = artists.flatMap(a => PROVIDERS.filter(p => a[p]).map(p => [a, p]));
      const results = new Array(jobs.length);
      const budget = { remaining: maxRequests, deadline: Date.now() + refreshTimeoutMs };
      let cursor = 0;
      await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
        while (cursor < jobs.length) {
        const index = cursor++, [a, p] = jobs[index];
        const result = await discover(a, p, budget);
        const key = sourceKey(a, p), old = previous.get(key);
        if (!result.source.complete && result.source.reason !== 'not_found' && old?.items.length && now() - Date.parse(old.source.fetchedAt) <= maxStaleMs) {
          result.items = [...new Map([...old.items, ...result.items].filter(item => !result.hidden.has(item.id)).map(item => [item.id, item])).values()];
          result.source.itemCount = result.items.length;
          result.source.fetchedAt = old.source.fetchedAt;
          result.retained = true;
        }
        results[index] = [key, result];
        }
      }));
      state.results = new Map(results);
      const values = [...state.results.values()];
      const items = [...new Map(values.flatMap(r => r.items).map(item => [item.id, item])).values()].sort((a,b) => uploadTime(b.createdAt) - uploadTime(a.createdAt) || a.id.localeCompare(b.id));
      state.expires = now() + ttlMs;
      state.snapshot = { items, total: items.length, complete: values.every(r => r.source.complete), sources: values.map(r => r.source), cache: { fetchedAt: new Date(now()).toISOString(), expiresAt: new Date(state.expires).toISOString(), refreshing: false, stale: values.some(r => r.retained) } };
    })().finally(() => { state.inflight = null; });
    return state.inflight;
  }
  return { async get(artists, { offset = 0, limit = 50, artistId } = {}) {
    const signature = JSON.stringify(artists.map(a => [a.id, a.name, a.profile_picture, a.mixcloud, a.soundcloud]));
    if (!entry || entry.signature !== signature) entry = { signature };
    const state = entry;
    if (!state.snapshot) await (state.inflight || refresh(state, artists));
    else if (now() >= state.expires && !state.inflight) refresh(state, artists);
    // Scope the original source results, not the globally deduplicated tracks:
    // two artist profiles can legitimately reference the same provider upload.
    const values = artistId === undefined ? null : [...state.results.values()].filter(r => r.source.artistId === artistId);
    const items = values && [...new Map(values.flatMap(r => r.items).map(item => [item.id, item])).values()].sort((a,b) => uploadTime(b.createdAt) - uploadTime(a.createdAt) || a.id.localeCompare(b.id));
    const result = values ? { ...state.snapshot, items, total: items.length, sources: values.map(r => r.source), complete: values.every(r => r.source.complete), cache: { ...state.snapshot.cache, stale: values.some(r => r.retained) } } : state.snapshot;
    return { ...result, items: result.items.slice(offset, offset + limit), offset, limit, nextOffset: offset + limit < result.total ? offset + limit : null, cache: { ...result.cache, refreshing: !!state.inflight, stale: result.cache.stale || !!state.inflight } };
  } };
}

// One process-local cache, created without networking.
export const getMediaLibrary = createMediaLibrary().get;
