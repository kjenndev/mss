import {useEffect,useRef} from 'react';
import {youtubeVideoId} from './mediaUrls';

let youtubeApiPromise;

function loadYouTubeApi() {
 if(window.YT?.Player)return Promise.resolve(window.YT);
 if(youtubeApiPromise)return youtubeApiPromise;
 youtubeApiPromise=new Promise((resolve,reject)=>{
  const previous=window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady=()=>{previous?.();resolve(window.YT);};
  const existing=document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
  if(existing)return;
  const script=document.createElement('script');
  script.src='https://www.youtube.com/iframe_api';
  script.async=true;
  script.onerror=()=>{youtubeApiPromise=undefined;reject(new Error('YouTube player API unavailable.'));};
  document.head.appendChild(script);
 });
 return youtubeApiPromise;
}

export default function CarouselYouTubePlayer({item,onPlaybackChange}) {
 const frame=useRef(null),playbackActive=useRef(false),id=youtubeVideoId(item);
 useEffect(()=>{
  let active=true,player;
  loadYouTubeApi().then(YT=>{
   if(!active || !frame.current)return;
   player=new YT.Player(frame.current,{events:{
    onStateChange:event=>{
     if(!active)return;
     if(event.data===YT.PlayerState.PLAYING || event.data===YT.PlayerState.BUFFERING){playbackActive.current=true;onPlaybackChange?.(true);}
     else if(event.data===YT.PlayerState.PAUSED || event.data===YT.PlayerState.ENDED){playbackActive.current=false;onPlaybackChange?.(false);}
    },
    onError:()=>{playbackActive.current=false;onPlaybackChange?.(false);}
   }});
  }).catch(()=>{});
  return ()=>{active=false;if(playbackActive.current){playbackActive.current=false;onPlaybackChange?.(false);}player?.destroy?.();};
 },[id,onPlaybackChange]);
 if(!id)return null;
 const origin=window.location.origin;
 return <iframe ref={frame} title={`Featured: ${item.title}`} src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=0&rel=0&enablejsapi=1&origin=${encodeURIComponent(origin)}`} allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/>;
}
