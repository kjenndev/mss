import { parseYouTubeUrl } from './youtube.js';
export const FEATURED_LIMIT = 100;
const fail = (message, status=400) => Object.assign(new Error(message), {status});
export function featuredUrls(body) {
 if (!body || Object.keys(body).some(key=>key!=='urls') || !Array.isArray(body.urls) || body.urls.length>FEATURED_LIMIT) throw fail('Use up to 100 distinct YouTube video URLs.');
 const parsed=body.urls.map(parseYouTubeUrl);
 if(new Set(parsed.map(v=>v.videoId)).size!==parsed.length) throw fail('Remove duplicate videos.');
 return parsed;
}
export function featuredDto(row) {
 return {id:`youtube:${row.video_id}`,videoId:row.video_id,provider:'youtube',platform:'YouTube',title:row.title,url:`https://www.youtube.com/watch?v=${row.video_id}`,artworkUrl:row.artwork_url,durationSeconds:row.duration_seconds,createdAt:new Date(row.published_at).toISOString(),metadataFetchedAt:new Date(row.fetched_at).toISOString(),playable:true,providerAccess:'playable'};
}
// Bounded admission: five in-flight official lookups, nine seconds per save.
// No DB transaction is held while these workers run; existing snapshots are reused.
export async function prepareFeatured(parsed, existing, provider, timeoutMs=9000) {
 let next=0, stopped=false, timer;
 const rows=new Array(parsed.length), saved=new Map(existing.map(row=>[row.video_id,row]));
 const worker=async()=>{
  while(!stopped && next<parsed.length) {
   const position=next++, video=parsed[position], old=saved.get(video.videoId);
   if(old) {rows[position]={...old,position};continue;}
   const metadata=await provider.get(video.url);
   rows[position]={video_id:metadata.videoId,title:metadata.title,artwork_url:metadata.artworkUrl,duration_seconds:metadata.durationSeconds,published_at:metadata.publishedAt,fetched_at:new Date().toISOString(),position};
  }
 };
 try {
  await Promise.race([Promise.all(Array.from({length:Math.min(5,parsed.length)},worker)),new Promise((_,reject)=>{timer=setTimeout(()=>reject(fail('Metadata lookup timed out; no changes saved. Try fewer new videos.',503)),timeoutMs);})]);
  return rows;
 } finally {stopped=true;clearTimeout(timer);}
}
