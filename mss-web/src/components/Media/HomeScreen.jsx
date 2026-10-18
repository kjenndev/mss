import {useCallback,useEffect,useState} from 'react';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import * as api from '../../Data.Helper.Api';
import FeaturedReel from './FeaturedReel';
import {validFeatured} from './featuredUtils';
import SyndicatePlayer from '../Stream/Syndicate.Player.Component';
import YouTubeVideo from './YouTubeVideo';
import CarouselYouTubePlayer from './CarouselYouTubePlayer';
import styles from './Featured.module.css';
import homeStyles from '../Home.Component.module.css';

function shuffledVideos(videos) {
 const shuffled=[...videos];
 for(let i=shuffled.length-1;i>0;i--) {
  const j=Math.floor(Math.random()*(i+1));
  [shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];
 }
 return shuffled;
}

export default function HomeScreen({liveLoading,live,settings,video,closeVideo,player}) {
 const [featured,setFeatured]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 const [liveId,setLiveId]=useState(null),[featuredId,setFeaturedId]=useState(null);
 const [rotationPaused,setRotationPaused]=useState(false),[interacting,setInteracting]=useState(false);
 const handlePlaybackChange=useCallback(playing=>{setRotationPaused(playing);if(!playing)setInteracting(false);},[]);
 useEffect(()=>{
  let active=true;
  (async()=>{try {const r=await api.GetHomeFeaturedVideos();if(!r.ok)throw Error();const d=await r.json();if(!validFeatured(d))throw Error();if(active){setFeatured(shuffledVideos(d.videos));setLoading(false);setError('');}}catch{if(active){setLoading(false);setError('Featured videos unavailable.');}}})();
  return ()=>{active=false;};
 },[attempt]);
 const liveItems=live.map(s=>({id:`live:${s.id}:${s.channelName}`,title:s.name,channelName:s.channelName,artworkUrl:s.artworkUrl,live:true}));
 const items=liveItems.length?liveItems:featured;
 const selectedId=liveItems.length?liveId:featuredId;
 const item=items.find(v=>v.id===selectedId) || items[0];
 const select=(id,meta)=>{if(meta?.userInitiated)setRotationPaused(true);if(liveItems.length)setLiveId(id);else setFeaturedId(id);};
 const disabled=Boolean(player?.item);
 const itemIds=items.map(value=>value.id).join('\u0000');
 const hasLive=liveItems.length>0;
 useEffect(()=>{if(liveItems.length && item?.id!==liveId)setLiveId(item.id);},[liveItems.length,item?.id,liveId]);
 useEffect(()=>{
  const ids=itemIds ? itemIds.split('\u0000') : [];
  if(ids.length<2 || disabled || video || rotationPaused || interacting)return;
  const seconds=Number(settings.homepage_carousel_interval_seconds);
  const delay=(Number.isInteger(seconds) && seconds>=1 && seconds<=3600 ? seconds : 8)*1000;
  const timer=setTimeout(()=>{
   const index=Math.max(0,ids.indexOf(item?.id));
   const next=ids[(index+1)%ids.length];
   if(hasLive)setLiveId(next);else setFeaturedId(next);
  },delay);
  return ()=>clearTimeout(timer);
 },[item?.id,itemIds,hasLive,disabled,video,rotationPaused,interacting,settings.homepage_carousel_interval_seconds]);
 const label=liveItems.length?'Return to live':'Return to video';
 if(video)return <><YouTubeVideo item={video} onClose={closeVideo} heading/><Button onClick={closeVideo}>{label}</Button></>;
 if(settings.show_live_section==='0')return null;
 if(liveLoading && !player?.item)return <section aria-label="Syndicate screen"><div className={styles.empty}><p role="status">Checking live status…</p></div></section>;
 const renderSelected=selected=>disabled?<div className={homeStyles.videoDisabled}><div className={homeStyles.disabledMessage}><PauseIcon className={homeStyles.disabledIcon} aria-hidden="true"/><strong>Video disabled</strong><p>While you listen to the artist library.</p><Button startIcon={<PlayArrowIcon aria-hidden="true"/>} variant="outlined" onClick={player.close}>{label}</Button></div></div>:selected.live?<div className={styles.player}><SyndicatePlayer videoOnly key={selected.id} channelName={selected.channelName} onPlaybackInteraction={()=>setRotationPaused(true)}/></div>:<div className={styles.player}><CarouselYouTubePlayer key={selected.id} item={selected} onPlaybackChange={handlePlaybackChange}/></div>;
 return <section aria-label="Syndicate screen" className={styles.screen}>
  {liveItems.length>0 && <div className={styles.heading}><h2>Live artists<span aria-hidden="true">.</span></h2></div>}
  {item?<FeaturedReel items={items} selectedId={item.id} onSelect={select} renderSelected={renderSelected} disabled={disabled} onInteractionChange={setInteracting} onPlaybackInteraction={item.live?()=>setRotationPaused(true):undefined}/>:<div className={styles.empty}>{loading?<p role="status">Loading featured videos…</p>:error?<Alert severity="error">{error}<Button onClick={()=>{setLoading(true);setError('');setAttempt(n=>n+1);}}>Retry featured videos</Button></Alert>:<p>No featured videos selected yet.</p>}</div>}
 </section>;
}
