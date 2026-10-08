import {useEffect,useState} from 'react';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import * as api from '../../Data.Helper.Api';
import {watchUrl} from '../../config';
import {youtubeVideoId} from './mediaUrls';
import FeaturedReel from './FeaturedReel';
import {validFeatured,duration} from './featuredUtils';
import SyndicatePlayer from '../Stream/Syndicate.Player.Component';
import YouTubeVideo from './YouTubeVideo';
import styles from './Featured.module.css';
import homeStyles from '../Home.Component.module.css';
export default function HomeScreen({liveLoading,live,settings,video,closeVideo,player}) {
 const [featured,setFeatured]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 const [liveId,setLiveId]=useState(null),[featuredId,setFeaturedId]=useState(null),[paused,setPaused]=useState(null);
 useEffect(()=>{
  let active=true;
  (async()=>{try {const r=await api.GetHomeFeaturedVideos();if(!r.ok)throw Error();const d=await r.json();if(!validFeatured(d))throw Error();if(active){setFeatured(d.videos);setLoading(false);setError('');}}catch{if(active){setLoading(false);setError('Featured videos unavailable.');}}})();
  return ()=>{active=false;};
 },[attempt]);
 const liveItems=live.map(s=>({id:`live:${s.id}:${s.channelName}`,title:s.name,channelName:s.channelName,artworkUrl:s.artworkUrl,live:true}));
 const items=liveItems.length?liveItems:featured;
 const selectedId=liveItems.length?liveId:featuredId;
 const item=items.find(v=>v.id===selectedId) || items[0];
 const select=id=>{if(liveItems.length)setLiveId(id);else setFeaturedId(id);};
 // Persist the effective identity, not a stale vanished selection that could return later.
 useEffect(()=>{if(liveItems.length && item?.id!==liveId)setLiveId(item.id);},[liveItems.length,item?.id,liveId]);
 const label=liveItems.length?'Return to live':'Return to video';
 if(video)return <><YouTubeVideo item={video} onClose={closeVideo} heading/><Button onClick={closeVideo}>{label}</Button></>;
 if(settings.show_live_section==='0')return null;
 if(liveLoading && !player?.item)return <section aria-label="Syndicate screen"><div className={styles.empty}><p role="status">Checking live status…</p></div></section>;
 const disabled=Boolean(player?.item);
 return <section aria-label="Syndicate screen" className={styles.screen}>
  {liveItems.length>0 && <div className={styles.heading}><h2>Live artists<span aria-hidden="true">.</span></h2></div>}
  {disabled?<div className={homeStyles.videoDisabled}><div className={homeStyles.disabledMessage}><PauseIcon className={homeStyles.disabledIcon} aria-hidden="true"/><strong>Video disabled</strong><p>While you listen to the artist library.</p><Button startIcon={<PlayArrowIcon aria-hidden="true"/>} variant="outlined" onClick={player.close}>{label}</Button></div></div>:item?.live?<div className={homeStyles.livePlayer}><SyndicatePlayer videoOnly key={item.id} channelName={item.channelName} isPaused={paused===item.channelName} onResume={()=>setPaused(null)}/></div>:item?<div className={styles.stage}><iframe key={item.id} title={`Featured: ${item.title}`} src={`https://www.youtube-nocookie.com/embed/${youtubeVideoId(item)}?autoplay=0&rel=0`} allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/></div>:<div className={styles.empty}>{loading?<p role="status">Loading featured videos…</p>:error?<Alert severity="error">{error}<Button onClick={()=>{setLoading(true);setError('');setAttempt(n=>n+1);}}>Retry featured videos</Button></Alert>:<p>No featured videos selected yet.</p>}</div>}
  {item && <div className={disabled?styles.disabled:undefined} inert={disabled?true:undefined} aria-disabled={disabled || undefined}><div className={styles.info}><div><p className={styles.label}>{item.live?'Syndicate Live · On air':'Featured selection · YouTube'}</p><h1>{item.title}</h1>{!item.live && <p>Published <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric',timeZone:'UTC'})}</time> · {duration(item.durationSeconds)}</p>}</div>{item.live?watchUrl(settings.streaming_platform_url,item.channelName) && <Button startIcon={<OpenInNewIcon aria-hidden="true"/>} variant="outlined" onClick={()=>{setPaused(item.channelName);window.open(watchUrl(settings.streaming_platform_url,item.channelName),'_blank','noopener,noreferrer');}}>Open platform player</Button>:<a href={item.url} target="_blank" rel="noopener noreferrer">Watch on YouTube <OpenInNewIcon aria-hidden="true" fontSize="small"/></a>}</div><FeaturedReel items={items} selectedId={item.id} onSelect={select}/></div>}
 </section>;
}
