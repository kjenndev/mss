import {useEffect,useRef,useState} from 'react';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import {featuredArtwork,duration} from './featuredUtils';
import styles from './Featured.module.css';
export function FeaturedArtwork({item}) {
 const src=featuredArtwork(item),[failed,setFailed]=useState('');
 return <span className={styles.artwork}>{src && src!==failed && <img src={src} alt="" loading="lazy" onError={()=>setFailed(src)}/>}<span className={styles.badge}>{item.live?'Live':duration(item.durationSeconds)}</span></span>;
}
export default function FeaturedReel({items,selectedId,onSelect,disabled=false}) {
 const reel=useRef(null);
 useEffect(()=>{
  const strip=reel.current,selected=strip?.querySelector('[aria-pressed="true"]');
  if(!selected)return;
  const tile=selected.getBoundingClientRect(),bounds=strip.getBoundingClientRect();
  // Only move this strip; scrollIntoView would also jump the main video/page.
  if(tile.right>bounds.right)strip.scrollLeft+=tile.right-bounds.right+3;
  else if(tile.left<bounds.left)strip.scrollLeft-=bounds.left-tile.left+3;
 },[items,selectedId]);
 if(items.length<2)return null;
 const index=Math.max(0,items.findIndex(item=>item.id===selectedId));
 return <div inert={disabled?true:undefined} aria-disabled={disabled || undefined} className={disabled?styles.disabled:undefined}>
  <div className={styles.navigation} aria-label="Video navigation"><button style={{minWidth:44,minHeight:44}} aria-label="Prev" title="Prev" onClick={()=>onSelect(items[(index+items.length-1)%items.length].id)}><ChevronLeftIcon aria-hidden="true"/></button><span aria-live="polite">{index+1} / {items.length}</span><button style={{minWidth:44,minHeight:44}} aria-label="Next" title="Next" onClick={()=>onSelect(items[(index+1)%items.length].id)}><ChevronRightIcon aria-hidden="true"/></button></div>
  <div ref={reel} className={styles.reel} aria-label={items[0].live?'Live artists':'Featured videos'}>{items.map(item=><button key={item.id} className={styles.tile} aria-label={`Select ${item.title}`} aria-pressed={item.id===items[index].id} onClick={()=>onSelect(item.id)}><FeaturedArtwork item={item}/><strong>{item.title}</strong><small>{item.live?'On air':`YouTube · ${duration(item.durationSeconds)}`}</small></button>)}</div>
 </div>;
}
