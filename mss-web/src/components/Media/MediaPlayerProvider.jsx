import SkipPreviousIcon from '@mui/icons-material/SkipPrevious';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import RefreshIcon from '@mui/icons-material/Refresh';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { useEffect, useState } from 'react';
import { playableUrl } from './mediaUrls';
import { MediaPlayerContext } from './MediaPlayerContext';
import styles from './Media.module.css';

function Player({item,attempt,onReload}) {
 const [status,setStatus]=useState('loading');
 useEffect(()=>{
  const timeout=setTimeout(()=>setStatus(current=>current==='loading'?'error':current),15000);
  return ()=>clearTimeout(timeout);
 },[attempt]);
 const soundcloud=item.provider==='soundcloud';
 const name=soundcloud?'SoundCloud':'Mixcloud';
 const params=new URLSearchParams(soundcloud
  ? {url:item.url,auto_play:'true',visual:'false',show_artwork:'false'}
  : {feed:item.url,autoplay:'1',mini:'1',hide_cover:'1'});
 return <>
  <iframe key={attempt} onLoad={()=>setStatus('loaded')} onError={()=>setStatus('error')} title={`${name} player`} src={`${soundcloud?'https://w.soundcloud.com/player/':'https://www.mixcloud.com/widget/iframe/'}?${params}`} width="100%" height="120" allow="autoplay" />
  {status!=='loaded' && <div className={styles.widgetStatus}><p role="status">{status==='loading' ? `Loading ${name} player…` : 'Player could not be loaded. Retry or open this upload on its provider.'}</p>{status==='error' && <button onClick={onReload}><RefreshIcon aria-hidden="true" fontSize="small" /> Retry player</button>}</div>}
 </>;
}

export function MediaPlayerProvider({children}) {
 const [queue,setQueue]=useState([]);
 const [attempt,setAttempt]=useState(0);
 const [index,setIndex]=useState(-1);
 const item=queue[index] || null;
 const close=()=>setIndex(-1);
 const select=(entry,entries)=>{
  if(!playableUrl(entry)) return;
  const safe=entries.filter(candidate=>playableUrl(candidate));
  setQueue(safe);setIndex(safe.findIndex(candidate=>candidate.id===entry.id));
 };
 return <MediaPlayerContext.Provider value={{item,select,close}}>
  {children}
  {item && <><div className={styles.playerSpace} aria-hidden="true"/><aside className={styles.player} aria-label="MSS audio player">
   <div className={styles.playerHeader}><div><h2>{item.title}</h2><p>{item.artistName} · {index+1} of {queue.length} in queue</p></div>
    <div className={styles.playerControls}><button onClick={()=>setIndex(index-1)} disabled={index<=0} aria-label="Previous track" title="Previous track"><SkipPreviousIcon /></button><button onClick={()=>setIndex(index+1)} disabled={index>=queue.length-1} aria-label="Next track" title="Next track"><SkipNextIcon /></button><a href={playableUrl(item)} target="_blank" rel="noopener noreferrer" aria-label={`Open on ${item.provider==='soundcloud'?'SoundCloud':'Mixcloud'}`} title={`Open on ${item.provider==='soundcloud'?'SoundCloud':'Mixcloud'}`}><OpenInNewIcon /></a><button onClick={()=>setAttempt(value=>value+1)} title="Reload player" aria-label="Reload player"><RefreshIcon /></button><button onClick={close} aria-label="Close audio player" title="Close audio player"><CloseIcon /></button></div>
   </div>
   <Player key={`${item.provider}:${item.id}:${attempt}`} item={item} attempt={attempt} onReload={()=>setAttempt(value=>value+1)}/>
  </aside></>}
 </MediaPlayerContext.Provider>;
}
