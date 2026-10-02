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
