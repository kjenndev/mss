import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, TextField, Typography } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import RefreshIcon from '@mui/icons-material/Refresh';
import * as api from '../../Data.Helper.Api';
import styles from './YouTube.module.css';

export default function YouTubeLinks({ artistId }) {
 const [snapshot,setSnapshot]=useState(null), [error,setError]=useState(''), [busy,setBusy]=useState(false), [url,setUrl]=useState(''), [confirm,setConfirm]=useState(null), [attempt,setAttempt]=useState(0), [message,setMessage]=useState('');
 const active=useRef(false);
 async function read() {
  const response=await api.GetArtistYouTubeVideos(artistId);
  if(!response?.ok) throw new Error('Unable to load YouTube video links.');
  const data=await response.json();
  if(!Array.isArray(data.videos) || typeof data.configured!=='boolean' || !Number.isInteger(data.limit)) throw new Error('Unable to load YouTube video links.');
  return data;
 }
 useEffect(()=>{
  active.current=true; let cancelled=false;
  (async()=>{try {const response=await api.GetArtistYouTubeVideos(artistId); if(!response?.ok) throw new Error(); const data=await response.json(); if(!Array.isArray(data.videos) || typeof data.configured!=='boolean' || !Number.isInteger(data.limit)) throw new Error(); if(!cancelled){setSnapshot(data);setError('');}}catch{if(!cancelled)setError('Unable to load YouTube video links.');}})();
  return ()=>{cancelled=true;active.current=false;};
 },[artistId,attempt]);
 async function mutate(action) {
  setBusy(true);setError('');setMessage('');
  try {
   const response=await action();const data=await response.json();
   if(!response.ok)throw new Error(data.error || 'Unable to save YouTube video links.');
   const fresh=await read();
   if(active.current){setSnapshot(fresh);setConfirm(null);setUrl('');setMessage('YouTube video links updated.');}
  } catch(error) {if(active.current)setError(error.message || 'Unable to save YouTube video links.');}
  finally {if(active.current)setBusy(false);}
 }
 return <Box component="section" aria-label="YouTube video links" className={styles.manager}>
  <Typography component="h2" variant="h6">YouTube video links</Typography>
  <Typography color="text.secondary">Add individual published videos to the artist library, separate from your channel. Links save immediately; no channel imports.</Typography>
  {error && <Alert severity="error">{error}<Button onClick={()=>setAttempt(n=>n+1)} disabled={busy}>Retry video links</Button></Alert>}
  {message && <p role="status">{message}</p>}
  {!snapshot && !error && <p role="status">Loading YouTube video links…</p>}
  {snapshot && <>
   {!snapshot.configured && <Alert severity="info">YouTube video additions are unavailable. Ask an administrator to configure the server-only YOUTUBE_API_KEY.</Alert>}
   <Box component="form" onSubmit={event=>{event.preventDefault();if(!busy && snapshot.configured && url.trim())mutate(()=>api.AddArtistYouTubeVideo(artistId,url.trim(),false));}} className={styles.add}>
    <TextField fullWidth label="YouTube Video URL" type="url" value={url} onChange={e=>setUrl(e.target.value)} disabled={busy || !snapshot.configured} inputProps={{maxLength:2048}} placeholder="https://www.youtube.com/watch?v=…" helperText={`Up to ${snapshot.limit} links. Sorted by YouTube's original published date, not when added.`} />
    <Button type="submit" variant="outlined" disabled={busy || !snapshot.configured || !url.trim() || snapshot.videos.length>=snapshot.limit}>Add video</Button>
   </Box>
   <p>{snapshot.videos.length} of {snapshot.limit} video links</p>
   {!snapshot.videos.length ? <p>No YouTube video links yet.</p> : <ul className={styles.links}>{snapshot.videos.map(video=><li key={video.videoId}><div><strong>{video.title}</strong><a href={video.url} target="_blank" rel="noopener noreferrer">Open on YouTube</a><time dateTime={video.createdAt}>{new Date(video.createdAt).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric',timeZone:'UTC'})}</time></div><div className={styles.actions}><Button startIcon={<RefreshIcon aria-hidden="true" />} disabled={busy || !snapshot.configured} onClick={()=>mutate(()=>api.AddArtistYouTubeVideo(artistId,video.url,true))} aria-label={`Refresh ${video.title}`}>Refresh metadata</Button><Button color="error" startIcon={<DeleteIcon aria-hidden="true" />} disabled={busy} onClick={()=>setConfirm(video.videoId)} aria-label={`Remove ${video.title}`}>Remove link</Button></div>{confirm===video.videoId && <div role="group" aria-label="Confirm video removal"><p>Remove this link from this artist? The YouTube video and other artist links are unchanged.</p><Button color="error" disabled={busy} onClick={()=>mutate(()=>api.DeleteArtistYouTubeVideo(artistId,video.videoId))}>Confirm removal</Button><Button disabled={busy} onClick={()=>setConfirm(null)}>Keep link</Button></div>}</li>)}</ul>}
  </>}
 </Box>;
}
