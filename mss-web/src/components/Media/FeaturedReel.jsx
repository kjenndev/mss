import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {featuredArtwork,duration} from './featuredUtils';
import styles from './Featured.module.css';

export function FeaturedArtwork({item}) {
 const src=featuredArtwork(item),[failed,setFailed]=useState('');
 return <span className={styles.artwork}>{src && src!==failed && <img src={src} alt="" loading="lazy" onError={()=>setFailed(src)}/>}<span className={styles.badge}>{item.live?'Live':duration(item.durationSeconds)}</span></span>;
}

const modulo=(value,length)=>((value%length)+length)%length;

function PreviewCard({item,index,onChoose,disabled,accessible}) {
 return <button disabled={disabled} inert={accessible?undefined:true} aria-hidden={accessible?undefined:true} tabIndex={accessible?undefined:-1} data-carousel-slot="true" data-carousel-id={item.id} data-carousel-index={index} className={styles.tile} aria-label={`Select ${item.title}`} onClick={event=>onChoose(index,{keyboard:event.detail===0})}><FeaturedArtwork item={item}/></button>;
}

export default function FeaturedReel({items,selectedId,onSelect,renderSelected=item=><><FeaturedArtwork item={item}/><strong>{item.title}</strong><small>{item.live?'On air':`YouTube · ${duration(item.durationSeconds)}`}</small></>,disabled=false,onInteractionChange,onPlaybackInteraction}) {
 const viewport=useRef(null),track=useRef(null),activeCard=useRef(null),resetTimer=useRef(null),focusFrame=useRef(null),instant=useRef(true),focusAfterSelection=useRef(false);
 const selectedIndex=Math.max(0,items.findIndex(item=>item.id===selectedId));
 const [virtualIndex,setVirtualIndex]=useState(()=>items.length+selectedIndex),[layoutVersion,setLayoutVersion]=useState(0);
 const ids=items.map(item=>item.id).join('\u0000');

 useEffect(()=>()=>{clearTimeout(resetTimer.current);clearTimeout(focusFrame.current);},[]);
 useEffect(()=>{
  const remeasure=()=>{instant.current=true;setLayoutVersion(value=>value+1);};
  window.addEventListener('resize',remeasure);
  const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(remeasure);
  if(viewport.current)observer?.observe(viewport.current);
  return ()=>{window.removeEventListener('resize',remeasure);observer?.disconnect();};
 },[]);
 useEffect(()=>{
  if(!onPlaybackInteraction)return;
  let focusTimer;
  const detectEmbeddedFocus=()=>{focusTimer=setTimeout(()=>{if(activeCard.current?.contains(document.activeElement))onPlaybackInteraction();},0);};
  window.addEventListener('blur',detectEmbeddedFocus);
  return ()=>{clearTimeout(focusTimer);window.removeEventListener('blur',detectEmbeddedFocus);};
 },[onPlaybackInteraction]);
 const displayIndex=(()=>{
  if(items.length<2)return 0;
  if(virtualIndex<0 || virtualIndex>=items.length*3)return items.length+selectedIndex;
  if(items[modulo(virtualIndex,items.length)]?.id===selectedId)return virtualIndex;
  const candidates=[selectedIndex,selectedIndex+items.length,selectedIndex+items.length*2];
  return candidates.reduce((best,value)=>Math.abs(value-virtualIndex)<Math.abs(best-virtualIndex)?value:best,candidates[0]);
 })();
 useEffect(()=>{if(virtualIndex!==displayIndex)setVirtualIndex(displayIndex);},[ids,displayIndex,virtualIndex]);

 useLayoutEffect(()=>{
  const strip=viewport.current,reel=track.current,target=reel?.querySelector(`[data-carousel-slot][data-carousel-index="${displayIndex}"]`);
  if(!strip || !reel || !target)return;
  const left=target.offsetLeft+target.offsetWidth/2-strip.clientWidth/2;
  const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  reel.style.transition=instant.current || reduced?'none':'transform 650ms cubic-bezier(.22,.75,.2,1)';
  reel.style.transform=`translate3d(${-left}px, 0, 0)`;
  if(activeCard.current)activeCard.current.style.left=`${target.offsetLeft+target.offsetWidth/2-activeCard.current.offsetWidth/2}px`;
  if(focusAfterSelection.current){clearTimeout(focusFrame.current);focusFrame.current=setTimeout(()=>activeCard.current?.focus({preventScroll:true}),0);focusAfterSelection.current=false;}
  instant.current=false;
  clearTimeout(resetTimer.current);
  if(items.length>1 && (displayIndex<items.length || displayIndex>=items.length*2)) {
   resetTimer.current=setTimeout(()=>{instant.current=true;setVirtualIndex(items.length+modulo(displayIndex,items.length));},700);
  }
 },[displayIndex,items.length,layoutVersion]);

 if(!items.length)return null;
 const choose=(target,{userInitiated=true,keyboard=false}={})=>{
  const direction=Math.sign(target-displayIndex);
  const outside=target<0 || target>=items.length*3;
  const bounded=outside?items.length+modulo(target,items.length):target;
  if(outside)instant.current=true;
  focusAfterSelection.current=keyboard;
  setVirtualIndex(bounded);
  onSelect(items[modulo(target,items.length)].id,{direction,userInitiated});
 };
 const interactionProps=onInteractionChange?{
  onPointerEnter:()=>onInteractionChange(true),
  onPointerLeave:()=>onInteractionChange(false),
  onFocusCapture:()=>onInteractionChange(true),
  onBlurCapture:event=>{if(!event.currentTarget.contains(event.relatedTarget))onInteractionChange(false);}
 }:{};

 const nearestCopy=itemIndex=>[0,1,2].reduce((best,copy)=>Math.abs(copy*items.length+itemIndex-displayIndex)<Math.abs(best*items.length+itemIndex-displayIndex)?copy:best,1);
 const selectedItem=items[selectedIndex];
 return <div className={styles.carousel} {...interactionProps}>
  <div ref={viewport} className={styles.reelViewport} aria-label={items.length===1?(items[0].live?'Live artist':'Featured video'):(items[0].live?'Live artists':'Featured videos')}>
   <div ref={track} className={styles.reel}>
    {[0,1,2].map(copy=><div key={copy} data-carousel-copy={copy} className={styles.copy}>
     {items.map((item,itemIndex)=>{
      const index=copy*items.length+itemIndex,activeSlot=index===displayIndex;
      return activeSlot || items.length===1?<span key={`${copy}:${item.id}`} data-carousel-slot="true" data-carousel-id={item.id} data-carousel-index={index} className={`${styles.tile} ${activeSlot?styles.activeSlot:styles.singleSlot}`} aria-hidden="true"/>:<PreviewCard key={`${copy}:${item.id}`} item={item} index={index} onChoose={choose} disabled={disabled} accessible={item.id!==selectedId && copy===nearestCopy(itemIndex)}/>;
     })}
    </div>)}
    <article key={selectedItem.id} ref={activeCard} tabIndex={-1} aria-label={`Now showing ${selectedItem.title}`} data-carousel-id={selectedItem.id} data-carousel-index={displayIndex} data-carousel-active="true" className={`${styles.tile} ${styles.tileActive} ${styles.tileOverlay}`}>{renderSelected(selectedItem)}</article>
   </div>
  </div>
 </div>;
}
