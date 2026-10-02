import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CloseIcon from '@mui/icons-material/Close';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RefreshIcon from '@mui/icons-material/Refresh';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { poll } from '../poll';
import { getImageUrl, watchUrl } from '../config';
import * as helpers from '../Data.Helper.Api';
import SyndicatePlayer from './Stream/Syndicate.Player.Component';
import MediaLibrary from './Media/MediaLibrary';
import { useMediaPlayer } from './Media/MediaPlayerContext';
import styles from './Home.Component.module.css';

const darkTheme = createTheme({ palette: { mode: 'dark', primary: { main: '#90caf9' } } });

function EventFlyer({src, title}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return null;
  return <img className={styles.eventFlyer} src={src} alt={`Flyer for ${title}`} loading="lazy" onError={() => setFailed(true)} />;
}

export default function Home() {
  const mediaPlayer = useMediaPlayer();
  const [contentLoading, setContentLoading] = useState(true);
  const [contentError, setContentError] = useState('');
  const [streamError, setStreamError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [live, setLive] = useState([]);
  const [images, setImages] = useState([]);
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [settings, setSettings] = useState({});
  const [galleryExpanded, setGalleryExpanded] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [pausedChannel, setPausedChannel] = useState(null);

  useEffect(() => {
    let active = true;
    const stop = poll(async () => {
      try {
        const response = await helpers.GetActiveSyndicateStreams();
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (active) {
          setLive((data.streams || []).map(stream => ({ id: stream.artistId, name: stream.artistName, channelName: stream.channelName })));
          setStreamError('');
        }
      } catch { if (active) { setLive([]); setStreamError('Live status unavailable. Retrying automatically.'); } }
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
        setUpcomingEvents((eventData.events || []).filter(event => event.date && new Date(event.date) > new Date()).sort((a,b) => new Date(a.date) - new Date(b.date)).slice(0,3));
        setContentError(''); setContentLoading(false);
      }
    }).catch(() => { if (active) { setContentLoading(false); setContentError('Unable to load home content.'); } });
    return () => { active = false; };
  }, [attempt]);

  const handleJoinChat = (channelName) => {
    const url = watchUrl(settings.streaming_platform_url, channelName);
    if (!url) return;
    setPausedChannel(channelName);
    window.open(url, '_blank', 'noopener,noreferrer');
  };
  const selectedIndex = live.length ? currentIndex % live.length : 0;
  const currentLive = live[selectedIndex] || null;

  const validImages = images.filter(image => image && getImageUrl(image.url));

  return <ThemeProvider theme={darkTheme}>
    <main className={styles.container}>
      {streamError && <Alert severity="warning">{streamError}</Alert>}
      {contentError && <Alert severity="error">{contentError}<Button startIcon={<RefreshIcon aria-hidden="true" />} onClick={() => { setContentLoading(true); setContentError(''); setAttempt(n => n + 1); }}>Retry content</Button></Alert>}
      {settings.show_live_section !== '0' && <section aria-label="Syndicate screen">
        {mediaPlayer?.item ? <div className={styles.videoDisabled}>
          <div className={styles.disabledMessage}>
            <PauseIcon className={styles.disabledIcon} aria-hidden="true" />
            <strong>Video disabled</strong>
            <p>While you listen to the artist library.</p>
            <Button startIcon={<PlayArrowIcon aria-hidden="true" />} variant="outlined" onClick={mediaPlayer.close}>Return to video</Button>
          </div>
        </div> : currentLive ? <div className={styles.livePlayer}>
          <SyndicatePlayer key={currentLive.channelName} channelName={currentLive.channelName} isPaused={pausedChannel === currentLive.channelName} onResume={() => setPausedChannel(null)} />
        </div> : <div className={styles.iframeWrapper}>
          <iframe title="Featured Syndicate video" src="https://www.youtube-nocookie.com/embed/z6aXbSXNiHE" allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
        </div>}
        <div className={`${styles.featureInfo} ${mediaPlayer?.item ? styles.featureDisabled : ''}`} inert={mediaPlayer?.item ? true : undefined} aria-disabled={mediaPlayer?.item ? true : undefined}>
          <div>
            <p className={styles.label}>{currentLive ? 'Syndicate Live · On air' : 'Groovematics · July 4, 2021'}</p>
            <h1>{currentLive ? currentLive.name : 'DK Bean'}</h1>
          </div>
          {currentLive ? <div className={styles.controls}>
            <span className={styles.muted}>Stream {selectedIndex + 1} of {live.length}</span>
            <Button aria-label="Prev" title="Prev" sx={{ minWidth: 44, minHeight: 44, p: 0 }} disabled={live.length <= 1} onClick={() => setCurrentIndex((selectedIndex - 1 + live.length) % live.length)}><ChevronLeftIcon aria-hidden="true" /></Button>
            <Button aria-label="Next" title="Next" sx={{ minWidth: 44, minHeight: 44, p: 0 }} disabled={live.length <= 1} onClick={() => setCurrentIndex((selectedIndex + 1) % live.length)}><ChevronRightIcon aria-hidden="true" /></Button>
            {watchUrl(settings.streaming_platform_url, currentLive.channelName) && <Button startIcon={<OpenInNewIcon aria-hidden="true" />} variant="outlined" onClick={() => handleJoinChat(currentLive.channelName)}>Open platform player</Button>}
          </div> : <div className={styles.controls}>
            <span className={styles.muted}>Featured replay · No autoplay</span>
            <a className={styles.outlineLink} href="https://www.youtube.com/watch?v=z6aXbSXNiHE" target="_blank" rel="noopener noreferrer">Watch on YouTube <OpenInNewIcon aria-hidden="true" fontSize="small" /></a>
          </div>}
        </div>
      </section>}
      <div className={styles.lower}>
        <MediaLibrary />
        <section aria-labelledby="home-events">
          <div className={styles.sectionHeading}><h2 id="home-events">Coming up</h2><Link to="/events">All events</Link></div>
          {contentLoading ? <p role="status" className={styles.empty}>Loading events…</p> : contentError ? <p className={styles.empty}>Events unavailable.</p> : upcomingEvents.length ? <ul className={styles.list}>{upcomingEvents.map(event => <li key={event.id}>
            <Link className={styles.eventCard} to={`/events/${event.id}`}>
              <time className={styles.date} dateTime={event.date}><span>{new Date(event.date).toLocaleDateString([], {month:'short'})}</span><strong>{new Date(event.date).getDate()}</strong></time>
              <EventFlyer key={event.flyer || 'no-flyer'} src={typeof event.flyer === 'string' ? getImageUrl(event.flyer) : ''} title={event.title} />
              <span><strong>{event.title}</strong><span className={styles.detail}>{new Date(event.date).toLocaleTimeString([], {timeStyle:'short'})} · {event.location || 'Location TBD'}</span></span>
            </Link>
          </li>)}</ul> : <p className={styles.empty}>No upcoming events announced.</p>}
        </section>
        <section aria-labelledby="home-gallery">
          <div className={styles.sectionHeading}><h2 id="home-gallery">In the frame</h2>{!contentError && validImages.length > 2 && <Button startIcon={galleryExpanded ? <ExpandLessIcon aria-hidden="true" /> : <ExpandMoreIcon aria-hidden="true" />} aria-expanded={galleryExpanded} aria-controls="home-photos" onClick={() => setGalleryExpanded(value => !value)}>{galleryExpanded ? 'Show fewer photos' : 'View all photos'}</Button>}</div>
          {contentLoading ? <p role="status" className={styles.empty}>Loading photos…</p> : contentError ? <p className={styles.empty}>Gallery unavailable.</p> : validImages.length ? <div id="home-photos" className={styles.galleryGrid}>{(galleryExpanded ? validImages : validImages.slice(0,2)).map((image,index) => <button type="button" key={image.id} className={styles.galleryItem} aria-label={`Open photo ${index + 1}`} onClick={() => setSelectedImage(image.url)}><img src={getImageUrl(image.url)} alt="Syndicate upload" /></button>)}</div> : <p className={styles.empty}>No photos have been uploaded to the Syndicate yet.</p>}
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
