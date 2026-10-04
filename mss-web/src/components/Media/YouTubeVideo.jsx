import CloseIcon from '@mui/icons-material/Close';
import Button from '@mui/material/Button';
import { youtubeVideoId } from './mediaUrls';
import styles from './YouTube.module.css';

export default function YouTubeVideo({ item, onClose, heading = false }) {
 const id = youtubeVideoId(item);
 if (!id) return null;
 return <section aria-label="Selected YouTube video" className={styles.video}>
  <iframe key={id} title={`YouTube: ${item.title}`} src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
  <div className={styles.info}><div><p>{item.artistName} · YouTube · <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric',timeZone:'UTC'})}</time>{Number.isFinite(item.durationSeconds) && ` · ${Math.ceil(item.durationSeconds / 60)} min`}</p>{heading ? <h1>{item.title}</h1> : <h2>{item.title}</h2>}<p>Your browser may require pressing Play. Availability and playback are controlled by YouTube.</p></div><div className={styles.actions}><a href={item.url} target="_blank" rel="noopener noreferrer">Watch on YouTube</a><Button startIcon={<CloseIcon aria-hidden="true" />} onClick={onClose} sx={{ minHeight:44 }}>Close video</Button></div></div>
 </section>;
}
