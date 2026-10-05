import {useEffect,useRef,useState} from 'react';
import {ThemeProvider,createTheme} from '@mui/material/styles';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Alert from '@mui/material/Alert';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import SaveIcon from '@mui/icons-material/Save';
import * as api from '../../Data.Helper.Api';
import FeaturedReel,{FeaturedArtwork} from '../Media/FeaturedReel';
import {validFeatured,duration} from '../Media/featuredUtils';
import styles from '../Media/Featured.module.css';
const theme=createTheme({palette:{mode:'dark',primary:{main:'#90caf9'}},shape:{borderRadius:4},components:{MuiButton:{styleOverrides:{root:{minHeight:44,textTransform:'none'}}}}});
async function readSettings() {
 const response=await api.GetHomeFeaturedVideos();if(!response.ok)throw Error('Unable to read featured settings.');
 const data=await response.json();if(!validFeatured(data))throw Error('Invalid featured settings response.');return data;
}
async function requireOk(response,fallback) {
 if(response.ok)return;
 let data;try{data=await response.json();}catch{ /* use truthful fallback */ }
 throw Error(typeof data?.error==='string'?data.error:fallback);
}
export default function AdminFeatured() {
 const [videos,setVideos]=useState([]),[ready,setReady]=useState(false),[loading,setLoading]=useState(true),[canAdd,setCanAdd]=useState(false),[busy,setBusy]=useState(''),[error,setError]=useState(''),[success,setSuccess]=useState(''),[dirty,setDirty]=useState(false),[url,setUrl]=useState(''),[selected,setSelected]=useState(null),[attempt,setAttempt]=useState(0);
 const generation=useRef(0),mounted=useRef(false);
 useEffect(()=>{
  mounted.current=true;const request=++generation.current;
  readSettings().then(data=>{if(mounted.current && request===generation.current){setVideos(data.videos);setCanAdd(data.canAdd);setReady(true);setLoading(false);setDirty(false);setError('');}}).catch(()=>{if(mounted.current && request===generation.current){setReady(false);setLoading(false);setError('Unable to load featured settings. No editing is allowed until a successful read.');}});
  return ()=>{mounted.current=false;generation.current=request+1;};
 },[attempt]);
 const changed=next=>{setVideos(next);setDirty(true);setSuccess('');setError('');};
 const add=async()=>{
  if(!ready || busy || !canAdd || videos.length>=100)return;setBusy('lookup');setError('');setSuccess('');
  const request=generation.current;
  try {
   const response=await api.PreviewHomeFeaturedVideo(url);await requireOk(response,'Video metadata unavailable.');const data=await response.json();
   if(!validFeatured({videos:[data.video],canAdd:true}))throw Error('Invalid video metadata.');
   if(!mounted.current || request!==generation.current)return;
   if(videos.some(v=>v.id===data.video.id))throw Error('This video is already selected.');
   changed([...videos,data.video]);setSelected(data.video.id);setUrl('');
  }catch(err){if(mounted.current && request===generation.current)setError(err.message);}
  finally{if(mounted.current && request===generation.current)setBusy('');}
 };
 const save=async()=>{
  if(!ready || busy || !dirty)return;setBusy('save');setError('');setSuccess('');const request=generation.current;let submitted=false;
  try {
   const urls=videos.map(v=>v.url);const response=await api.SaveHomeFeaturedVideos(urls);await requireOk(response,'Unable to save featured videos.');submitted=true;
   const saved=await readSettings();
   if(!mounted.current || request!==generation.current)return;
   setVideos(saved.videos);setCanAdd(saved.canAdd);setDirty(false);
   if(JSON.stringify(saved.videos.map(v=>v.url))!==JSON.stringify(urls))throw Error('Featured settings changed in another session. The current saved selection has been loaded; review before editing.');
   setSuccess('Homepage featured videos saved.');
  }catch(err){if(mounted.current && request===generation.current){setError(submitted?'Save was submitted but could not be confirmed. Retry to load the saved selection.':err.message);if(submitted)setReady(false);}}
  finally{if(mounted.current && request===generation.current)setBusy('');}
 };
 const current=videos.find(v=>v.id===selected)||videos[0];
 const move=(index,delta)=>{const next=[...videos];[next[index],next[index+delta]]=[next[index+delta],next[index]];changed(next);};
 return <ThemeProvider theme={theme}><main className={styles.admin}>
  <p className={styles.label}>Site settings</p><h1>Homepage featured videos<span aria-hidden="true">.</span></h1>
  <p>Choose YouTube videos and their order. Live artists take priority while broadcasting; your selection returns when nobody is live. Artist library order is unchanged.</p>
  {loading?<p role="status">Loading featured settings…</p>:<>{error && <Alert severity="error">{error}</Alert>}{success && <Alert severity="success">{success}</Alert>}
  {!ready?<Button onClick={()=>{setLoading(true);setError('');setAttempt(n=>n+1);}}>Retry featured settings</Button>:<>
   <div className={styles.heading}><p role="status">{busy==='lookup'?'Looking up official YouTube metadata…':busy==='save'?'Saving and confirming…':dirty?'Unsaved changes':`${videos.length} selected · Up to 100 videos`}</p><Button variant="contained" startIcon={<SaveIcon aria-hidden="true"/>} disabled={Boolean(busy)||!dirty} onClick={save}>Save changes</Button></div>
   {!canAdd && <Alert severity="warning">YouTube additions are unavailable until the server is configured. Existing videos can still be reordered or removed.</Alert>}
   <div className={styles.form}><TextField label="YouTube video URL" value={url} onChange={e=>setUrl(e.target.value)} disabled={Boolean(busy)||!canAdd||videos.length>=100} slotProps={{htmlInput:{maxLength:2048}}} placeholder="https://www.youtube.com/watch?v=…"/><Button variant="outlined" onClick={add} disabled={Boolean(busy)||!canAdd||!url.trim()||videos.length>=100}>Add video</Button></div>
   {!videos.length?<p>No featured videos selected. Add a video, or save the empty selection to remove the carousel.</p>:<ol className={styles.rows}>{videos.map((video,i)=><li key={video.id} className={styles.row}><span><strong>{i+1}. {video.title}</strong><small>Published {new Date(video.createdAt).toLocaleDateString(undefined,{timeZone:'UTC'})} · {duration(video.durationSeconds)}</small></span><Button aria-label={`Move video ${i+1} up`} disabled={Boolean(busy)||i===0} onClick={()=>move(i,-1)}><ArrowUpwardIcon aria-hidden="true"/></Button><Button aria-label={`Move video ${i+1} down`} disabled={Boolean(busy)||i===videos.length-1} onClick={()=>move(i,1)}><ArrowDownwardIcon aria-hidden="true"/></Button><Button aria-label={`Remove video ${i+1}`} disabled={Boolean(busy)} onClick={()=>changed(videos.filter((_,index)=>index!==i))}>Remove</Button></li>)}</ol>}
   {current && <section className={styles.preview} aria-label="Featured preview"><h2>Preview</h2><p>No playback. Changes appear on the homepage only after saving.</p><FeaturedArtwork item={current}/><h3>{current.title}</h3><FeaturedReel items={videos} selectedId={current.id} onSelect={setSelected} disabled={Boolean(busy)}/></section>}
  </>}</>}
 </main></ThemeProvider>;
}
