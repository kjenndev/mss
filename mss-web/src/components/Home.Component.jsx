import CloseIcon from '@mui/icons-material/Close';
import RefreshIcon from '@mui/icons-material/Refresh';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { poll } from '../poll';
import { getImageUrl } from '../config';
import * as helpers from '../Data.Helper.Api';
import HomeScreen from './Media/HomeScreen';
import MediaLibrary from './Media/MediaLibrary';
import { useLocalVideo } from './Media/useLocalVideo';
import { useMediaPlayer } from './Media/MediaPlayerContext';
import styles from './Home.Component.module.css';

const darkTheme = createTheme({ palette: { mode: 'dark', primary: { main: '#90caf9' } } });

function EventFlyer({src}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return null;
  return <img className={styles.eventBackdrop} src={src} alt="" aria-hidden="true" loading="lazy" onError={() => setFailed(true)} />;
}

function EventList({ events }) {
  return <ul className={styles.list}>{events.map(event => <li key={event.id}>
    <Link className={styles.eventCard} to={`/events/${event.id}`}>
      <time className={styles.date} dateTime={event.date}><span>{new Date(event.date).toLocaleDateString([], {month:'short'})}</span><strong>{new Date(event.date).getDate()}</strong></time>
      <EventFlyer key={event.flyer || 'no-flyer'} src={typeof event.flyer === 'string' ? getImageUrl(event.flyer) : ''} />
      <span><strong>{event.title}</strong><span className={styles.detail}>{new Date(event.date).toLocaleTimeString([], {timeStyle:'short'})} · {event.location || 'Location TBD'}</span></span>
    </Link>
  </li>)}</ul>;
}

export default function Home() {
  const mediaPlayer = useMediaPlayer();
  const { video, selectVideo, closeVideo } = useLocalVideo();
  const [contentLoading, setContentLoading] = useState(true);
  const [contentError, setContentError] = useState('');
  const [streamError, setStreamError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [live, setLive] = useState([]);
  const [liveLoading, setLiveLoading] = useState(true);
  const [images, setImages] = useState([]);
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [previousEvents, setPreviousEvents] = useState([]);
  const [settings, setSettings] = useState({});
  const [selectedImage, setSelectedImage] = useState(null);

  useEffect(() => {
    let active = true;
    const stop = poll(async () => {
      try {
        const response = await helpers.GetActiveSyndicateStreams();
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (active) {
          setLive((data.streams || []).map(stream => ({ id: stream.artistId, name: stream.artistName, channelName: stream.channelName, artworkUrl: stream.artistImage })));
          setStreamError('');
        }
      } catch { if (active) { setLive([]); setStreamError('Live status unavailable. Retrying automatically.'); } }
      finally { if (active) setLiveLoading(false); }
    });
    return () => { active = false; stop(); };
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([helpers.GetSettings(), helpers.GetAllEvents(), helpers.GetAllImages()]).then(async responses => {
      if (responses.some(response => !response.ok)) throw new Error();
      const [settingsData, eventData, imageData] = await Promise.all(responses.map(response => response.json()));
      if (active) {
        setSettings(settingsData.settings || {}); setImages(imageData.images || []);
        // Compare full canonical event timestamps, including their timezone offsets.
        // GetAllEvents returns the complete, unpaginated catalog.
        const now = Date.now();
        const datedEvents = (eventData.events || []).filter(event => typeof event?.date === 'string' && Number.isFinite(Date.parse(event.date)));
        setUpcomingEvents(datedEvents.filter(event => Date.parse(event.date) > now).sort((a,b) => Date.parse(a.date) - Date.parse(b.date)).slice(0,3));
        setPreviousEvents(datedEvents.filter(event => Date.parse(event.date) < now).sort((a,b) => Date.parse(b.date) - Date.parse(a.date) || a.id - b.id).slice(0,10));
        setContentError(''); setContentLoading(false);
      }
    }).catch(() => { if (active) { setContentLoading(false); setContentError('Unable to load home content.'); } });
    return () => { active = false; };
  }, [attempt]);

  const validImages = images.filter(image => image && getImageUrl(image.url));

  return <ThemeProvider theme={darkTheme}>
    <main className={styles.container}>
      {streamError && <Alert severity="warning">{streamError}</Alert>}
      {contentError && <Alert severity="error">{contentError}<Button startIcon={<RefreshIcon aria-hidden="true" />} onClick={() => { setContentLoading(true); setContentError(''); setAttempt(n => n + 1); }}>Retry content</Button></Alert>}
      <HomeScreen liveLoading={liveLoading} live={live} settings={settings} video={video} closeVideo={closeVideo} player={mediaPlayer} />
      <div className={styles.lower}>
        <MediaLibrary fillHeight onVideoSelect={selectVideo} selectedVideoId={video?.id} />
        <div className={styles.eventsColumn}>
          <section aria-labelledby="home-events">
            <div className={styles.sectionHeading}><h2 id="home-events">Coming up</h2><Link to="/events">All events</Link></div>
            {contentLoading ? <p role="status" className={styles.empty}>Loading events…</p> : contentError ? <p className={styles.empty}>Events unavailable.</p> : upcomingEvents.length ? <EventList events={upcomingEvents} /> : <p className={styles.empty}>No upcoming events announced.</p>}
          </section>
          <section aria-labelledby="home-previous">
            <div className={styles.sectionHeading}><h2 id="home-previous">Previous</h2></div>
            {contentLoading ? <p role="status" className={styles.empty}>Loading previous events…</p> : contentError ? <p className={styles.empty}>Previous events unavailable.</p> : previousEvents.length ? <EventList events={previousEvents} /> : <p className={styles.empty}>No previous events.</p>}
          </section>
        </div>
        <section aria-labelledby="home-gallery">
          <div className={styles.sectionHeading}><h2 id="home-gallery">In the frame</h2></div>
          {contentLoading ? <p role="status" className={styles.empty}>Loading photos…</p> : contentError ? <p className={styles.empty}>Gallery unavailable.</p> : validImages.length ? <div id="home-photos" className={styles.galleryGrid}>{validImages.map((image,index) => <button type="button" key={image.id} className={styles.galleryItem} aria-label={`Open photo ${index + 1}`} onClick={() => setSelectedImage(image.url)}><img src={getImageUrl(image.url)} alt="Syndicate upload" /></button>)}</div> : <p className={styles.empty}>No photos have been uploaded to the Syndicate yet.</p>}
        </section>
      </div>
      <Dialog open={Boolean(selectedImage)} onClose={() => setSelectedImage(null)} maxWidth="lg" transitionDuration={0} slotProps={{ paper: { 'aria-label': 'Gallery photo' } }}>
        <DialogContent className={styles.lightboxContent}>
          <Button aria-label="Close photo" title="Close photo" sx={{ minWidth: 44, minHeight: 44, p: 0 }} onClick={() => setSelectedImage(null)}><CloseIcon aria-hidden="true" /></Button>
          <img src={selectedImage ? getImageUrl(selectedImage) : undefined} alt="Gallery Lightbox" className={styles.lightboxImage} />
        </DialogContent>
      </Dialog>
    </main>
  </ThemeProvider>;
}
