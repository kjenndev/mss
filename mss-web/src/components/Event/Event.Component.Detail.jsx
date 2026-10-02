import RefreshIcon from '@mui/icons-material/Refresh';
import EditIcon from '@mui/icons-material/Edit';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import Alert from '@mui/material/Alert';
import { getImageUrl } from '../../config';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Avatar from '@mui/material/Avatar';
import CircularProgress from '@mui/material/CircularProgress';

import * as helpers from '../../Data.Helper.Api';
import CommentSection from '../Comments/CommentSection';
import styles from './Event.Component.Detail.module.css';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
  },
});

export default function EventDetailRoute() {
  const { id } = useParams();
  return <EventDetail key={id} id={id} />;
}

function EventDetail({ id }) {
  const [failedFlyer, setFailedFlyer] = useState(null);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const navigate = useNavigate();

  const mounted = useRef(false);
  const requestVersion = useRef(0);
  const uploadVersion = useRef(0);

  const fetchEvent = useCallback(async () => {
    if (!mounted.current) return;
    const version = ++requestVersion.current;
    const isCurrent = () => mounted.current && version === requestVersion.current;
    setLoading(true); setLoadError('');
    try {
      const response = await helpers.GetEventById(id);
      if (!isCurrent()) return;
      if (response.ok) {
        const data = await response.json();
        if (!isCurrent()) return;
        setEvent(data.event);
      } else {
        setLoadError('Unable to load event.');
      }
    } catch (err) {
      if (!isCurrent()) return;
      console.error(err);
      setLoadError('Unable to load event.');
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    mounted.current = true;
    fetchEvent();
    return () => {
      mounted.current = false;
      requestVersion.current += 1;
      uploadVersion.current += 1;
    };
  }, [fetchEvent]);

  async function handleImageUpload(e) {
    if (mounted.current && e.target.files && e.target.files[0]) {
      const version = ++uploadVersion.current;
      const isCurrent = () => mounted.current && version === uploadVersion.current;
      setUploading(true); setError('');
      try {
        const response = await helpers.UploadEventImage(id, e.target.files[0]);
        if (!isCurrent()) return;
        if (response.ok) {
          await fetchEvent();
        } else { setError('Gallery upload failed. Choose the file again to retry.'); }
      } catch {
        if (!isCurrent()) return;
        setError('Gallery upload failed. Choose the file again to retry.');
      } finally {
        if (isCurrent()) {
          e.target.value = '';
          setUploading(false);
        }
      }
    }
  }

  if (loadError) return <Alert severity="error">{loadError}<Button startIcon={<RefreshIcon aria-hidden="true" />} onClick={fetchEvent}>Retry</Button></Alert>;
  if (loading) {
    return (
      <Container className={styles.container}>
        <Box display="flex" justifyContent="center">
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  if (!event) return null;

  const canEdit = helpers.CanEditEvent(event);
  const isArtistInEvent = event.artists.some(a => a.id === helpers.GetSessionArtistId());
  const canUploadImages = helpers.IsAdmin() || canEdit || isArtistInEvent;

  return (
    <Container maxWidth="lg" className={styles.container}>
      <ThemeProvider theme={darkTheme}>
        <div className={styles.detail}>
          <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
            <Link to="/events">Events</Link><span aria-hidden="true"> / </span><span>{event.title}</span>
          </nav>
          {error && <Alert severity="error">{error}</Alert>}
          <div className={styles.hero}>
            <aside className={styles.flyerColumn}>
              <div className={styles.flyerContainer}>
                {event.flyer && failedFlyer !== event.flyer ? (
                  <img src={getImageUrl(event.flyer)} alt={event.title} onError={() => setFailedFlyer(event.flyer)} className={styles.flyerImage} />
                ) : (
                  <Typography color="text.secondary">No Flyer Available</Typography>
                )}
              </div>
              {event.flyer_artist_name && (
                <p className={styles.credit}>
                  Flyer Art by: {' '}
                  {event.flyer_artist_url ? (
                    <a href={event.flyer_artist_url} target="_blank" rel="noopener noreferrer">{event.flyer_artist_name}</a>
                  ) : event.flyer_artist_name}
                </p>
              )}
            </aside>
            <article className={styles.summary}>
              <p className={styles.eyebrow}>Midnight Sound Syndicate / Event</p>
              <h1 className={styles.title}>{event.title}<span aria-hidden="true">.</span></h1>
              <dl className={styles.facts}>
                <div><dt>When</dt><dd>{event.date ? new Date(event.date).toLocaleString() : 'Date TBD'}</dd></div>
                <div><dt>Where</dt><dd>{event.location || 'Location TBD'}</dd></div>
              </dl>
              <div className={styles.actions}>
                {event.ticket_link && (
                  <Button variant="contained" href={event.ticket_link} target="_blank" rel="noopener noreferrer">Get Tickets</Button>
                )}
                {canEdit && (
                  <Button startIcon={<EditIcon aria-hidden="true" />} variant="outlined" onClick={() => navigate(`/events/${event.id}/update`)}>Edit Event</Button>
                )}
              </div>
              <section className={styles.infoSection}>
                <h2>The lineup</h2>
                <div className={styles.artists}>
                  {event.artists.map((artist) => (
                    <Link key={artist.id} to={`/artists/${artist.id}`} className={styles.artistLink}>
                      <Avatar src={getImageUrl(artist.profile_picture) || undefined} aria-hidden="true" />
                      <span>{artist.name}</span>
                    </Link>
                  ))}
                </div>
              </section>
              <section className={styles.infoSection}>
                <h2>About the Event</h2>
                <p className={styles.description}>{event.description || 'No description provided.'}</p>
              </section>
            </article>
          </div>
          <div className={styles.lower}>
            <section aria-labelledby="event-photos-title">
              <h2 id="event-photos-title">Event Photos</h2>
              {event.images && event.images.length > 0 ? (
                <div className={styles.imageGrid}>
                  {event.images.map((img, index) => (
                    <a key={img.id} href={getImageUrl(img.url)} target="_blank" rel="noopener noreferrer" aria-label={`Open event photo ${index + 1}`}>
                      <img src={getImageUrl(img.url)} alt={`Event photo ${index + 1}`} className={styles.eventImage} />
                    </a>
                  ))}
                </div>
              ) : <p className={styles.empty}>No photos yet.</p>}
              {canUploadImages && (
                <div className={styles.uploadBox}>
                  <h3>Upload Event Photos</h3>
                  <p>Share what went down at the event!</p>
                  <Button variant="outlined" component="label" disabled={uploading}
                    startIcon={uploading ? <CircularProgress size={20} color="inherit" /> : <CloudUploadIcon aria-hidden="true" />}>
                    {uploading ? 'Uploading...' : 'Upload Photo'}
                    <input accept="image/*" className={styles.fileInput} id="event-image-upload" type="file" aria-label="Upload Photo" onChange={handleImageUpload} disabled={uploading} />
                  </Button>
                </div>
              )}
            </section>
            <section aria-labelledby="event-conversation-title" className={styles.conversation}>
              <h2 id="event-conversation-title">Conversation</h2>
              <CommentSection eventId={event.id} />
            </section>
          </div>
        </div>
      </ThemeProvider>
    </Container>
  );
}
