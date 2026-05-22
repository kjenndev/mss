import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardActions from '@mui/material/CardActions';
import Grid from '@mui/material/Grid';
import Avatar from '@mui/material/Avatar';
import LiveTvIcon from '@mui/icons-material/LiveTv';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import CloudIcon from '@mui/icons-material/Cloud';
import QueueMusicIcon from '@mui/icons-material/QueueMusic';
import YouTubeIcon from '@mui/icons-material/YouTube';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';

import * as helpers from '../Data.Helper.Api';
import SyndicatePlayer from './Stream/Syndicate.Player.Component';
import styles from './Home.Component.module.css';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#90caf9',
    },
  },
});

export default function Home() {
  const navigate = useNavigate();
  const [live, setLive] = useState([]);
  const [feed, setFeed] = useState([]);
  const [images, setImages] = useState([]);
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [settings, setSettings] = useState({});
  const [selectedImage, setSelectedImage] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isStreamPaused, setIsStreamPaused] = useState(false);

  const getImageUrl = (path) => {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    return `http://localhost:4000${path}`;
  };

  const getPlatformIcon = (platform) => {
    switch (platform) {
      case 'Syndicate Live':
      case 'Twitch': return <LiveTvIcon className={styles.platformIconTwitch} />;
      case 'SoundCloud': return <CloudIcon className={styles.platformIconSoundCloud} />;
      case 'Mixcloud': return <QueueMusicIcon className={styles.platformIconMixcloud} />;
      case 'YouTube': return <YouTubeIcon className={styles.platformIconYouTube} />;
      default: return <OpenInNewIcon className={styles.platformIconDefault} />;
    }
  };

  useEffect(() => {
    const fetchLiveData = () => {
      // Strictly pull active streams from our RTMP server
      helpers.GetActiveSyndicateStreams().then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          
          // Map active streams to the carousel format
          const active = (data.streams || []).map(s => ({
            id: s.artistId,
            name: s.artistName,
            channelName: s.channelName,
            slug: s.streamKey,
            live: true,
            playUrl: s.playUrl,
            hlsUrl: s.hlsUrl,
            twitchUrl: s.twitchUrl,
            startedAt: s.startedAt
          }));
          
          setLive(active);
        }
      });
    };

    fetchLiveData();
    const interval = setInterval(fetchLiveData, 10000); // Poll every 10 seconds for faster updates

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // 2. Fetch Global Feed
    helpers.GetGlobalFeed().then((res) => {
      if (res.ok) {
        res.json().then((data) => setFeed(data.feed || []));
      }
    });

    // 2.2 Fetch System Settings
    helpers.GetSettings().then(async (res) => {
      if (res.ok) {
        const data = await res.json();
        setSettings(data.settings || {});
      }
    });

    // 2.5 Fetch Upcoming Events
    helpers.GetAllEvents().then(async (res) => {
      if (res.ok) {
        const data = await res.json();
        const now = new Date();
        const upcoming = (data.events || [])
          .filter(e => e.date && new Date(e.date) > now)
          .sort((a, b) => new Date(a.date) - new Date(b.date))
          .slice(0, 6);
        setUpcomingEvents(upcoming);
      }
    });

    // 3. Fetch Global Gallery
    helpers.GetAllImages()
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          console.log('Home: Successfully fetched gallery images:', data.images);
          setImages(data.images || []);
        } else {
          console.error('Home: Failed to fetch gallery images, status:', res.status);
        }
      })
      .catch(err => {
        console.error('Home: Error fetching gallery images:', err);
      });
  }, []);

  useEffect(() => {
    setIsStreamPaused(false);
  }, [currentIndex, live]);

  const handleJoinChat = (channelName) => {
    setIsStreamPaused(true);
    const url = `${settings.streaming_platform_url || 'http://localhost:5174'}/watch/${channelName}`;
    window.open(url, '_blank');
  };

  const currentLive = live.length ? live[currentIndex] : null;

  return (
    <Container className={styles.container}>
      <ThemeProvider theme={darkTheme}>
        {/* Branding Section */}
        <Paper elevation={3} className={styles.sectionPaper}>
          <Typography variant="h3" gutterBottom sx={{ fontWeight: 800 }}>
            {settings.site_title || 'Midnight Sound Syndicate'}
          </Typography>
          <Typography variant="body1" gutterBottom sx={{ color: 'text.secondary', fontSize: '1.1rem' }}>
            {settings.site_description || 'Discover and stay connected'}
          </Typography>
        </Paper>

        {/* Twitch Carousel (Primary Section) */}
        {live.length > 0 && settings.show_live_section !== '0' && (
          <Paper elevation={3} className={styles.carouselSectionPaper}>
            <Box className={styles.carouselContent}>
              <Box className={styles.carouselHeader}>
                <Box className={styles.artistInfo}>
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>{currentLive.name}</Typography>
                  <Box className={styles.liveIndicator}>
                    <FiberManualRecordIcon sx={{ fontSize: 10 }} />
                    <Typography variant="caption" sx={{ fontWeight: 800, textTransform: 'uppercase' }}>LIVE</Typography>
                  </Box>
                </Box>
                
                <Typography variant="caption" color="text.secondary">
                  Stream {currentIndex + 1} of {live.length}
                </Typography>
              </Box>

              <Box sx={{ mb: 2 }}>
                <SyndicatePlayer 
                  channelName={currentLive.channelName} 
                  isPaused={isStreamPaused}
                  onResume={() => setIsStreamPaused(false)}
                />
              </Box>

              <Box className={styles.carouselControls}>
                <Box className={styles.buttonGroup}>
                  <Button 
                    variant="outlined"
                    startIcon={<NavigateBeforeIcon />}
                    disabled={live.length <= 1} 
                    onClick={() => setCurrentIndex((currentIndex - 1 + live.length) % live.length)}
                    sx={{ borderRadius: 2 }}
                  >
                    Prev
                  </Button>
                  <Button 
                    variant="outlined"
                    endIcon={<NavigateNextIcon />}
                    disabled={live.length <= 1} 
                    onClick={() => setCurrentIndex((currentIndex + 1) % live.length)}
                    sx={{ borderRadius: 2 }}
                  >
                    Next
                  </Button>
                </Box>
                
                {currentLive?.channelName && (
                  <Button 
                    onClick={() => handleJoinChat(currentLive.channelName)}
                    variant="contained"
                    size="small"
                    className={styles.openTwitchButton}
                    sx={{ borderRadius: '20px', textTransform: 'none', px: 3 }}
                  >
                    Join Chat
                  </Button>
                )}
              </Box>
            </Box>
          </Paper>
        )}

        {/* Upcoming Events Section */}
        {upcomingEvents.length > 0 && (
          <Paper elevation={3} className={styles.feedSectionPaper}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                Upcoming Events
              </Typography>
              <Button onClick={() => navigate('/events')} size="small" variant="text" endIcon={<NavigateNextIcon />}>
                All Events
              </Button>
            </Box>
            <Grid container spacing={3} justifyContent="center">
              {upcomingEvents.map((event) => (
                <Grid item xs="auto" key={`event-${event.id}`}>
                  <Card className={styles.eventCard}>
                    {event.flyer ? (
                      <Box className={styles.eventFlyerWrapper} onClick={() => navigate(`/events/${event.id}`)}>
                        <img 
                          src={getImageUrl(event.flyer)} 
                          alt={event.title} 
                          className={styles.eventFlyer}
                        />
                      </Box>
                    ) : (
                      <Box 
                        className={styles.eventPlaceholder} 
                        onClick={() => navigate(`/events/${event.id}`)}
                      >
                        <Typography variant="h5" color="text.secondary">NO FLYER</Typography>
                      </Box>
                    )}
                    <CardContent className={styles.eventCardContent}>
                      <Typography variant="subtitle1" noWrap sx={{ fontWeight: 700 }}>
                        {event.title}
                      </Typography>
                      <Typography variant="caption" color="primary" display="block" sx={{ fontWeight: 600 }}>
                        {new Date(event.date).toLocaleDateString([], { dateStyle: 'medium' })} @ {new Date(event.date).toLocaleTimeString([], { timeStyle: 'short' })}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {event.location || 'Location TBD'}
                      </Typography>
                    </CardContent>
                    <CardActions className={styles.cardActions}>
                      <Button 
                        onClick={() => navigate(`/events/${event.id}`)}
                        size="small" 
                        variant="outlined"
                        className={styles.viewButton}
                      >
                        Details
                      </Button>
                    </CardActions>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Paper>
        )}

        {/* Latest Content Feed */}
        <Paper elevation={3} className={styles.feedSectionPaper}>
          <Typography variant="h5" gutterBottom className={styles.feedTitle}>
            Latest Syndicate Content
          </Typography>
          <Grid container spacing={3} justifyContent="center">
            {feed.map((item, index) => (
              <Grid item xs="auto" key={`feed-${index}`}>
                <Card className={styles.feedCard}>
                  <CardContent className={styles.cardContent}>
                    <Box className={styles.artistAvatarRow}>
                      <Avatar 
                        src={getImageUrl(item.artistImage)} 
                        sx={{ width: 44, height: 44, bgcolor: 'primary.main', border: '2px solid rgba(255,255,255,0.1)' }}
                      >
                        {item.artistName?.charAt(0)}
                      </Avatar>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="subtitle2" noWrap sx={{ fontWeight: 700, fontSize: '0.95rem' }}>
                          {item.artistName}
                        </Typography>
                        <Box className={styles.platformRow}>
                          {getPlatformIcon(item.platform)}
                          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                            {item.platform}
                          </Typography>
                        </Box>
                      </Box>
                    </Box>
                    <Typography variant="body1" sx={{ fontWeight: 500, lineHeight: 1.5, color: 'text.primary' }}>
                      {item.title}
                    </Typography>
                  </CardContent>
                  <CardActions className={styles.cardActions}>
                    <Button 
                      href={item.url.startsWith('/watch/') ? `${settings.streaming_platform_url || 'http://localhost:5174'}${item.url}` : item.url} 
                      target="_blank" 
                      size="small" 
                      variant="outlined"
                      className={styles.viewButton}
                    >
                      {item.platform === 'Syndicate Live' ? 'Join Chat' : 'View'}
                    </Button>
                  </CardActions>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Paper>

        {/* Global Photo Gallery */}
        <Paper elevation={3} className={styles.galleryPaper}>
          <Typography variant="h5" gutterBottom sx={{ fontWeight: 700 }}>
            Syndicate Photo Gallery
          </Typography>
          <Box className={styles.galleryGrid}>
            {(!images || images.length === 0) ? (
              <Box sx={{ py: 8, textAlign: 'center', width: '100%' }}>
                <Typography color="text.secondary">No photos have been uploaded to the Syndicate yet.</Typography>
              </Box>
            ) : (
              images.filter(img => img && img.url).map((image) => (
                <Box 
                  key={`global-img-${image.id}`} 
                  className={styles.galleryItem}
                  onClick={() => setSelectedImage(image.url)}
                >
                  <img 
                    src={getImageUrl(image.url)} 
                    alt="Syndicate upload" 
                    className={styles.galleryImage} 
                  />
                </Box>
              ))
            )}
          </Box>
        </Paper>

        {/* Image Lightbox Modal */}
        <Dialog
          open={Boolean(selectedImage)}
          onClose={() => setSelectedImage(null)}
          maxWidth="lg"
          PaperProps={{ className: styles.lightboxOverlay }}
        >
          <DialogContent className={styles.lightboxContent}>
            <img 
              src={selectedImage ? getImageUrl(selectedImage) : ''} 
              alt="Gallery Lightbox" 
              className={styles.lightboxImage}
              onClick={() => setSelectedImage(null)}
            />
          </DialogContent>
        </Dialog>
      </ThemeProvider>
    </Container>
  );
}
