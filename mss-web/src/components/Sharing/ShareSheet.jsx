import { useState, useRef, useEffect } from 'react';
import { Button, Dialog, DialogTitle, DialogContent, IconButton, Typography, Alert } from '@mui/material';
import ShareIcon from '@mui/icons-material/Share';
import CloseIcon from '@mui/icons-material/Close';
import InstagramIcon from '@mui/icons-material/Instagram';
import FacebookIcon from '@mui/icons-material/Facebook';
import LinkIcon from '@mui/icons-material/Link';
import { sharingData, createSharePng, downloadCard } from './shareCard';
import styles from './ShareSheet.module.css';

export default function ShareSheet({ kind, entity }) {
 const data = sharingData(kind, entity);
 const [busy, setBusy] = useState(false);
 const [open, setOpen] = useState(false);
 const [failedImage, setFailedImage] = useState('');
 const [message, setMessage] = useState('');
 const generation = useRef(0);
 useEffect(() => () => { generation.current++; }, []);
 const close = () => { generation.current++; setOpen(false); setBusy(false); };
 async function copy() {
  const version = generation.current;
  try {
   await navigator.clipboard.writeText(data.url);
   if (version === generation.current) setMessage('Link copied.');
  } catch {
   if (version === generation.current) setMessage('Copy failed. Select and copy the URL below.');
  }
 }
 async function instagram() {
  const version = generation.current;
  setBusy(true); setMessage('Preparing PNG…');
  // Start clipboard access during the user gesture; never claim it succeeded early.
  const copied = Promise.resolve().then(() => navigator.clipboard.writeText(data.url)).then(() => true, () => false);
  try {
   const blob = await createSharePng(data);
   const copyOk = await copied;
   if (version !== generation.current) return;
   downloadCard(blob, data.title);
   setMessage(copyOk ? 'PNG download started. Link copied. Add both in Instagram yourself.' : 'PNG download started. Copy failed. Select and copy the URL below.');
  } catch (error) {
   const copyOk = await copied;
   if (version === generation.current) setMessage(`Card download failed: ${error.message} ${copyOk ? 'Link copied.' : 'Copy failed. Select and copy the URL below.'}`);
  } finally { if (version === generation.current) setBusy(false); }
 }
 return <>
  <Button startIcon={<ShareIcon />} onClick={() => { setMessage(''); setOpen(true); }} sx={{ minHeight: 44 }}>Share {kind === 'artists' ? 'artist' : 'event'}</Button>
  <Dialog open={open} onClose={close} maxWidth="md" fullWidth aria-labelledby="share-sheet-title" slotProps={{ paper: { className: styles.paper } }}>
   <DialogTitle id="share-sheet-title" className={styles.heading}>Take the sound with you<IconButton aria-label="Close sharing" onClick={close} sx={{ minWidth: 44, minHeight: 44 }}><CloseIcon /></IconButton></DialogTitle>
   <DialogContent>
    <div className={styles.columns}>
     <div>
      <div className={styles.card}>
       <div className={styles.brand}>MIDNIGHT SOUND<br />SYNDICATE</div>
       <div className={styles.art}>
        {data.image && failedImage !== data.image ? <img src={data.image} alt={`${data.title} ${kind === 'artists' ? 'artist portrait' : 'event flyer'}`} onError={() => setFailedImage(data.image)} /> : <span>{kind === 'artists' ? 'Artist photo unavailable' : 'Event flyer unavailable'}</span>}
       </div>
       <div className={styles.cardFooter}><strong>{data.title}<span aria-hidden="true">.</span></strong>{data.detail && <p>{data.detail}</p>}</div>
      </div>
      <p className={styles.caption}>PORTRAIT SHARE CARD · PREVIEW</p>
     </div>
     <div className={styles.actions}>
      <Typography component="h2" variant="h5">Made to pass along.</Typography>
      <p>A {kind === 'artists' ? 'profile' : 'flyer'} card for your next story.</p>
      <Button variant="contained" startIcon={<InstagramIcon />} onClick={instagram} disabled={!data.url || busy}>Instagram · Save card & copy link</Button>
      <Button variant="outlined" startIcon={<FacebookIcon />} component="a" href={data.url ? `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(data.url)}` : undefined} target="_blank" rel="noopener noreferrer" disabled={!data.url}>Facebook · Share {kind === 'artists' ? 'profile' : 'event'}</Button>
      <Button variant="outlined" startIcon={<LinkIcon />} onClick={copy} disabled={!data.url}>Copy link</Button>
      <p className={styles.note}>For Instagram, save the card and copy the link, then add them in Instagram yourself. Nothing is posted automatically.</p>
      {!data.url && <Alert severity="info">Public sharing is not configured for this site.</Alert>}
      {message && <p role="status">{message}</p>}
      {data.url && <label className={styles.url}>Share URL<input aria-label="Share URL" readOnly value={data.url} onFocus={e => e.target.select()} /></label>}
     </div>
    </div>
   </DialogContent>
  </Dialog>
 </>;
}
