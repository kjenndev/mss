import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RefreshIcon from '@mui/icons-material/Refresh';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import styles from './Media.module.css';
import { useEffect, useRef, useState } from 'react';
import { playableUrl, youtubeVideoId } from './mediaUrls';
import { useMediaPlayer } from './MediaPlayerContext';
import { GetMediaLibrary } from '../../Data.Helper.Api';

// Mirror the metadata adapter's provider artwork boundary; never resolve local uploads.
function artworkUrl(item) {
 if(typeof item.artworkUrl!=='string') return null;
 try {
  const url=new URL(item.artworkUrl);
  const domains=item.provider==='soundcloud' ? ['sndcdn.com'] : item.provider==='mixcloud' ? ['mixcloud.com','mixcloudusercontent.com','mixcdn.com'] : item.provider==='youtube' ? ['ytimg.com'] : [];
  return url.protocol==='https:' && !url.username && !url.password && !url.port && domains.some(domain=>url.hostname===domain || url.hostname.endsWith(`.${domain}`)) ? url.href : null;
 } catch { return null; }
}
function TrackArtwork({item}) {
 const src=artworkUrl(item);
 const [failedSources,setFailedSources]=useState(()=>new Set());
 return <span className={styles.artwork} aria-hidden="true">{src && !failedSources.has(src) && <img key={src} src={src} onError={()=>setFailedSources(previous=>new Set(previous).add(src))} alt="" loading="lazy" referrerPolicy="no-referrer" />}</span>;
}
const newestFirst = (a,b) => {
 const aTime=Date.parse(a.createdAt), bTime=Date.parse(b.createdAt);
 const aKnown=Number.isFinite(aTime), bKnown=Number.isFinite(bTime);
 if(aKnown!==bKnown) return aKnown ? -1 : 1;
 return (aKnown ? bTime-aTime : 0) || a.id.localeCompare(b.id);
};
export default function MediaLibrary({ artistId, renderIntro, fillHeight = false, onVideoSelect, selectedVideoId } = {}) {
 return <ScopedMediaLibrary key={artistId ?? 'all'} artistId={artistId} renderIntro={renderIntro} fillHeight={fillHeight} onVideoSelect={onVideoSelect} selectedVideoId={selectedVideoId} />;
}
function ScopedMediaLibrary({ artistId, renderIntro, fillHeight, onVideoSelect, selectedVideoId }) {
 const player=useMediaPlayer();
 const [snapshot,setSnapshot]=useState(null);
 const snapshotId=useRef(null);
 const refreshAttempts=useRef(0);
 const [items,setItems]=useState([]);
 const [unsafe,setUnsafe]=useState(false);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState(false);
 const [request,setRequest]=useState({offset:0,attempt:0});
 useEffect(()=>{
  let active=true;
  (async()=>{try {
   const response=await (artistId === undefined ? GetMediaLibrary(request.offset) : GetMediaLibrary(request.offset, artistId));
   if(!response?.ok) throw new Error('Library unavailable');
   const data=await response.json();
   if(!Array.isArray(data.items) || !Array.isArray(data.sources) || !Number.isInteger(data.total) || (data.nextOffset!==null && (!Number.isInteger(data.nextOffset) || data.nextOffset<=request.offset))) throw new Error('Invalid library');
   if(!active) return;
   if(request.offset && (data.cache?.version ?? data.cache?.fetchedAt)!==snapshotId.current) {
    snapshotId.current=null; setItems([]); setRequest(previous=>({offset:0,attempt:previous.attempt+1})); return;
   }
   snapshotId.current=data.cache?.version ?? data.cache?.fetchedAt;
   setSnapshot(data);
   const safe=data.items.filter(item=>typeof item?.id==='string' && typeof item.title==='string' && (playableUrl(item) || youtubeVideoId(item)));
   setUnsafe(previous=>(request.offset ? previous : false) || safe.length!==data.items.length);
   setItems(previous=>[...new Map([...(request.offset ? previous : []),...safe].map(item=>[item.id,item])).values()].sort(newestFirst));
  } catch {if(active)setError(true);} finally {if(active)setLoading(false);}})();
  return ()=>{active=false;};
 },[request,artistId]);
 useEffect(()=>{
  if(!snapshot || loading || error) return;
  const refreshing=snapshot.cache?.refreshing;
  const expiry=Date.parse(snapshot.cache?.expiresAt);
  if(!refreshing) refreshAttempts.current=0;
  if(refreshing && refreshAttempts.current>=12) return;
  if(!refreshing && !Number.isFinite(expiry)) return;
  const delay=refreshing ? 5000 : Math.min(2147483647,Math.max(30000,expiry-Date.now()));
  const timer=setTimeout(()=>{
   if(refreshing) refreshAttempts.current+=1;
   setLoading(true);setError(false);setRequest(previous=>({offset:0,attempt:previous.attempt+1}));
  },delay);
  return ()=>clearTimeout(timer);
 },[snapshot,loading,error]);
 const load=(offset)=>{setError(false);setLoading(true);setRequest(previous=>({offset,attempt:previous.attempt+1}));};
 const latest=items.find(item=>playableUrl(item) && item.playable!==false && item.providerAccess!=='blocked');
 const canListen=Boolean(player && latest && !loading && !error);
 return <>{renderIntro?.({canListen,listenToLatest:()=>{if(canListen) player.select(latest,items);}})}<section className={`${styles.library} ${fillHeight ? styles.fillHeight : ''}`} aria-label="Artist library">
  <header className={styles.libraryHeader}><div><p className={styles.eyebrow}>{artistId === undefined ? 'From the artists' : 'From this artist'}</p><h2>Artist library</h2><p className={styles.subtitle}>SoundCloud, Mixcloud &amp; artist-linked YouTube videos. Newest published first.</p></div>{snapshot && <div><span className={styles.count}>{items.length} of {snapshot.total} uploads</span> <button aria-label="Reload library" title="Reload library" style={{ minWidth: 44, minHeight: 44 }} disabled={loading} onClick={()=>{refreshAttempts.current=0;load(0);}}><RefreshIcon aria-hidden="true" /></button></div>}</header>
  {snapshot?.complete===false && <div role="status"><p>Some artist sources are unavailable or incomplete.</p><ul>{snapshot.sources.filter(source=>source.status!=='ok').map((source,index)=><li key={`${source.artistId}:${source.provider}:${index}`}>{source.artistName} · {source.provider}: {source.message}</li>)}</ul></div>}
  {snapshot?.cache?.stale && <p role="status">Showing cached uploads{snapshot.cache.refreshing ? ' while sources refresh.' : '; some sources could not be refreshed.'}</p>}
  {unsafe && <p role="alert">Some uploads could not be displayed safely.</p>}
  {loading && <p role="status">Loading artist uploads…</p>}
  {error && <p role="alert">Unable to load the artist library. <button onClick={()=>load(request.offset)}><RefreshIcon aria-hidden="true" fontSize="small" /> Retry library</button></p>}
  {items.length ? <ul className={styles.tracks}>{items.map(item=><li key={item.id} className={styles.track}><TrackArtwork item={item} /><button className={styles.selectTrack} onClick={()=>item.provider==='youtube' ? onVideoSelect?.(item) : player?.select(item,items)} disabled={item.provider==='youtube' && (!onVideoSelect || item.playable===false || item.providerAccess==='blocked')} aria-pressed={(item.provider==='youtube' ? selectedVideoId : player?.item?.id)===item.id} aria-label={`Play ${item.title}`}><span className={styles.playMark} aria-hidden="true"><PlayArrowIcon aria-hidden="true" /></span><span className={styles.trackTitle}><strong>{item.title}</strong><span className={styles.artist}>{item.artistName || 'Artist'}</span></span></button><span className={styles.provider}>{item.provider==='youtube'?'YouTube':item.provider==='soundcloud'?'SoundCloud':'Mixcloud'}</span><span className={styles.trackMeta}>{Number.isFinite(Date.parse(item.createdAt)) ? <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric',timeZone:'UTC'})}</time> : <span>Upload date unknown</span>}{Number.isFinite(item.durationSeconds) && item.durationSeconds>0 && <span>{Math.ceil(item.durationSeconds/60)} min</span>}{item.providerAccess==='preview' && <span>Preview only</span>}{item.providerAccess==='blocked' && <span>Restricted · check provider</span>}{item.playable===false && <span>Embedding unavailable · check provider</span>}</span></li>)}</ul> : !loading && !error && <p>{snapshot?.complete===false ? 'No uploads are available from the responding sources.' : 'No public uploads found for linked artist profiles.'}</p>}
  {!error && snapshot?.nextOffset!=null && <button disabled={loading} onClick={()=>load(snapshot.nextOffset)}><ExpandMoreIcon aria-hidden="true" fontSize="small" /> Load more uploads</button>}
 </section></>;
}
