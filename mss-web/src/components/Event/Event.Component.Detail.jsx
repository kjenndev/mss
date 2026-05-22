import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Chip from '@mui/material/Chip';
import Avatar from '@mui/material/Avatar';
import Divider from '@mui/material/Divider';
import CircularProgress from '@mui/material/CircularProgress';

import * as helpers from '../../Data.Helper.Api';
import CommentSection from '../Comments/CommentSection';
import styles from './Event.Component.Detail.module.css';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
  },
});

export default function EventDetail() {
  const { id } = useParams();
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchEvent();
  }, [id]);

  async function fetchEvent() {
    setLoading(true);
    try {
      const response = await helpers.GetEventById(id);
      if (response.ok) {
        const data = await response.json();
        setEvent(data.event);
      } else {
        navigate('/events');
      }
    } catch (err) {
      console.error(err);
      navigate('/events');
    } finally {
      setLoading(false);
    }
  }

  async function handleImageUpload(e) {
    if (e.target.files && e.target.files[0]) {
      setUploading(true);
      try {
        const response = await helpers.UploadEventImage(id, e.target.files[0]);
        if (response.ok) {
          fetchEvent();
        }
      } catch (err) {
        console.error(err);
      } finally {
        setUploading(false);
      }
    }
  }

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
        <Paper elevation={4} className={styles.mainPaper}>
          <Grid container spacing={4}>
            <Grid item xs={12} md={5}>
              <Box className={styles.flyerContainer}>
                {event.flyer ? (
                  <img 
                    src={event.flyer.startsWith('http') ? event.flyer : `http://localhost:4000${event.flyer}`} 
                    alt={event.title} 
                    className={styles.flyerImage}
                  />
                ) : (
                  <Box p={4} textAlign="center">
                    <Typography variant="h6" color="text.secondary">No Flyer Available</Typography>
                  </Box>
                )}
              </Box>
              
              {event.flyer_artist_name && (
                <Box mb={2} textAlign="center">
                  <Typography variant="caption" color="text.secondary">
                    Flyer Art by: {' '}
                    {event.flyer_artist_url ? (
                      <a href={event.flyer_artist_url} target="_blank" rel="noopener noreferrer" style={{ color: '#90caf9', textDecoration: 'none' }}>
                        {event.flyer_artist_name}
                      </a>
                    ) : (
                      event.flyer_artist_name
                    )}
                  </Typography>
                </Box>
              )}
              
              {event.ticket_link && (
                <Button 
                  fullWidth 
                  variant="contained" 
                  color="primary" 
                  href={event.ticket_link} 
                  target="_blank"
                  style={{ marginBottom: '1rem' }}
                >
                  Get Tickets
                </Button>
              )}

              {canEdit && (
                <Button 
                  fullWidth 
                  variant="outlined" 
                  onClick={() => navigate(`/events/${event.id}/update`)}
                >
                  Edit Event
                </Button>
              )}
            </Grid>

            <Grid item xs={12} md={7}>
              <Stack spacing={3}>
                <Box>
                  <Typography variant="h3" gutterBottom>{event.title}</Typography>
                  <Typography variant="h6" color="primary">
                    {event.date ? new Date(event.date).toLocaleString() : 'Date TBD'}
                  </Typography>
                  <Typography variant="h6" color="text.secondary">
                    {event.location || 'Location TBD'}
                  </Typography>
                </Box>

                <Divider />

                <Box className={styles.infoSection}>
                  <Typography variant="h6" gutterBottom>Artists</Typography>
                  <Box display="flex" flexWrap="wrap" gap={1}>
                    {event.artists.map((artist) => (
                      <Chip
                        key={artist.id}
                        avatar={<Avatar src={artist.profile_picture ? `http://localhost:4000${artist.profile_picture}` : ''} />}
                        label={artist.name}
                        onClick={() => navigate(`/artists/${artist.id}`)}
                        className={styles.artistChip}
                        clickable
                      />
                    ))}
                  </Box>
                </Box>

                <Box className={styles.infoSection}>
                  <Typography variant="h6" gutterBottom>About the Event</Typography>
                  <Typography variant="body1" style={{ whiteSpace: 'pre-wrap' }}>
                    {event.description || 'No description provided.'}
                  </Typography>
                </Box>
              </Stack>
            </Grid>
          </Grid>

          <Box mt={6}>
            <Typography variant="h4" gutterBottom>Event Photos</Typography>
            <Divider />
            
            {event.images && event.images.length > 0 ? (
              <Grid container spacing={2} className={styles.imageGrid}>
                {event.images.map((img) => (
                  <Grid item xs={6} sm={4} md={3} key={img.id}>
                    <img 
                      src={`http://localhost:4000${img.url}`} 
                      alt="Event" 
                      className={styles.eventImage}
                      onClick={() => window.open(`http://localhost:4000${img.url}`, '_blank')}
                    />
                  </Grid>
                ))}
              </Grid>
            ) : (
              <Box py={4} textAlign="center">
                <Typography color="text.secondary">No photos yet.</Typography>
              </Box>
            )}

            {canUploadImages && (
              <Box className={styles.uploadBox}>
                <Typography variant="h6" gutterBottom>Upload Event Photos</Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Share what went down at the event!
                </Typography>
                <input
                  accept="image/*"
                  style={{ display: 'none' }}
                  id="event-image-upload"
                  type="file"
                  onChange={handleImageUpload}
                  disabled={uploading}
                />
                <label htmlFor="event-image-upload">
                  <Button 
                    variant="contained" 
                    component="span" 
                    disabled={uploading}
                    startIcon={uploading && <CircularProgress size={20} color="inherit" />}
                  >
                    {uploading ? 'Uploading...' : 'Upload Photo'}
                  </Button>
                </label>
              </Box>
            )}
          </Box>

          <Box mt={6}>
            <CommentSection eventId={event.id} />
          </Box>
        </Paper>
      </ThemeProvider>
    </Container>
  );
}
