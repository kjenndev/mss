import RefreshIcon from '@mui/icons-material/Refresh';
import EditIcon from '@mui/icons-material/Edit';
import ArrowOutwardIcon from '@mui/icons-material/ArrowOutward';
import AddIcon from '@mui/icons-material/Add';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import {useState,useEffect} from 'react';
import {getImageUrl} from '../../config';
import * as helpers from '../../Data.Helper.Api';
import styles from './Event.Component.List.module.css';
const eventTime = event => event.date ? Date.parse(event.date) : NaN;
export default function EventList(){
 const [events,setEvents]=useState([]);
 const [loading,setLoading]=useState(true);
 const [failedFlyers,setFailedFlyers]=useState({});
 const [query,setQuery]=useState('');
 const [sort,setSort]=useState('desc');
 const [error,setError]=useState('');
 const [attempt,setAttempt]=useState(0);
 useEffect(()=>{let active=true;helpers.GetAllEvents().then(async response=>{
  if(!response.ok)throw new Error();
  const data=await response.json();
  if(!Array.isArray(data.events)||data.events.some(e=>!e||typeof e.title!=='string'||!['number','string'].includes(typeof e.id)))throw new Error();
  if(active){setEvents(data.events);setError('');setLoading(false);}
 }).catch(()=>{if(active){setError('Unable to load events.');setLoading(false);}});return()=>{active=false;};},[attempt]);
 const search=query.trim().toLocaleLowerCase();
 const visible=events.filter(event=>`${event.title} ${event.location || ''}`.toLocaleLowerCase().includes(search)).sort((a,b)=>{
  const at=eventTime(a),bt=eventTime(b);const ak=Number.isFinite(at),bk=Number.isFinite(bt);
  if(ak!==bk)return ak?-1:1;
  return (ak?(sort==='asc'?at-bt:bt-at):0)||String(a.id).localeCompare(String(b.id));
 });
 return <section className={styles.container} aria-labelledby="events-heading">
  <header className={styles.lead}><div><p className={styles.eyebrow}>Midnight Sound Syndicate</p><h1 id="events-heading">Events<span aria-hidden="true">.</span></h1></div>{helpers.HasSession()&&<a className={styles.create} href="/events/create"><AddIcon aria-hidden="true" fontSize="small"/>Create Event</a>}</header>
  <div className={styles.tools}><input className={styles.search} type="search" aria-label="Search events" placeholder="Search events or locations…" value={query} onChange={e=>setQuery(e.target.value)}/><select aria-label="Sort events" value={sort} onChange={e=>setSort(e.target.value)}><option value="asc">Date: earliest first</option><option value="desc">Date: latest first</option></select><span className={styles.count} role="status">{loading?'Loading events…':error?'Event count unavailable':search?`${visible.length} of ${events.length} events`:`${events.length} ${events.length===1?'event':'events'}`}</span></div>
  {!loading&&!error&&!events.length&&<p className={styles.empty}>No events yet.</p>}
  {!loading&&!error&&events.length>0&&!visible.length&&<p className={styles.empty}>No matching events. Try another title or location.</p>}
  {error?<Alert severity="error">{error}<Button startIcon={<RefreshIcon aria-hidden="true"/>} onClick={()=>{setLoading(true);setError('');setAttempt(n=>n+1);}}>Retry</Button></Alert>:<div className={styles.grid} aria-busy={loading}>{!loading&&visible.map(event=>{
   const time=eventTime(event),date=Number.isFinite(time)?new Date(time):null;
   return <article key={event.id} className={styles.event}>
    <div className={styles.flyer}>{getImageUrl(event.flyer)&&failedFlyers[event.id]!==event.flyer?<img src={getImageUrl(event.flyer)} alt={event.title} loading="lazy" onError={()=>setFailedFlyers(previous=>({...previous,[event.id]:event.flyer}))}/>:<div className={styles.noFlyer}><CalendarMonthIcon aria-hidden="true"/><span>No flyer available</span></div>}</div>
    <div className={styles.info}><p className={styles.date}>{date?<time dateTime={date.toISOString()}>{date.toLocaleDateString([],{dateStyle:'medium'})} · {date.toLocaleTimeString([],{timeStyle:'short'})}</time>:'Date to be announced'}</p><h2>{event.title}</h2><p className={styles.location}>{event.location || 'Location to be announced'}</p><div className={styles.bottom}><a className={`${styles.action} ${styles.cardLink}`} href={`/events/${event.id}`}>Details <ArrowOutwardIcon aria-hidden="true" fontSize="small"/></a>{helpers.CanEditEvent(event)&&<a className={`${styles.action} ${styles.secondaryAction}`} href={`/events/${event.id}/update`}><EditIcon aria-hidden="true" fontSize="small"/>Edit</a>}</div></div>
   </article>;
  })}</div>}
 </section>;
}
