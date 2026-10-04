export function youtubeVideoId(item) {
 if(item?.provider!=='youtube' || typeof item.url!=='string' || !Number.isFinite(Date.parse(item.createdAt))) return '';
 try { const url=new URL(item.url); const id=url.searchParams.get('v');
  return url.origin==='https://www.youtube.com' && !url.username && !url.password && url.pathname==='/watch' && url.search===`?v=${id}` && !url.hash && /^[A-Za-z0-9_-]{11}$/.test(id || '') && item.id===`youtube:${id}` ? id : '';
 } catch { return ''; }
}
export function playableUrl(item) {
 if (!item || typeof item.url !== 'string') return '';
 try {
  const url=new URL(item.url);
  const hosts={soundcloud:['soundcloud.com','www.soundcloud.com'],mixcloud:['mixcloud.com','www.mixcloud.com']};
  if(url.protocol!=='https:' || url.username || url.password || url.port || !hosts[item.provider]?.includes(url.hostname) || url.search || url.hash) return '';
  if(!/^\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\/?$/.test(url.pathname)) return '';
  return url.href;
 } catch {return '';}
}
