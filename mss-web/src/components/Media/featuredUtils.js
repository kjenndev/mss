import {getImageUrl} from '../../config';
import {youtubeVideoId} from './mediaUrls';
export function validFeatured(data) {
 return Boolean(data && typeof data.canAdd==='boolean' && Array.isArray(data.videos) && data.videos.length<=100 && new Set(data.videos.map(v=>v?.id)).size===data.videos.length && data.videos.every(v=>youtubeVideoId(v) && typeof v.title==='string' && v.title.trim() && Number.isFinite(v.durationSeconds) && v.durationSeconds>0));
}
export function duration(value) {const seconds=Math.floor(value);return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;}
export function featuredArtwork(item) {
 if(item.live) return getImageUrl(item.artworkUrl);
 try {const u=new URL(item.artworkUrl);return u.protocol==='https:' && ['i.ytimg.com','i9.ytimg.com'].includes(u.hostname) && !u.username && !u.password && !u.port ? u.href : '';}catch{return '';}
}
