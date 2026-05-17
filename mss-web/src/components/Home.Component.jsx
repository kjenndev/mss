import { useEffect, useState } from 'react';
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
  const [live, setLive] = useState([]);
  const [feed, setFeed] = useState([]);
  const [images, setImages] = useState([]);
  const [selectedImage, setSelectedImage] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const getImageUrl = (path) => {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    return `http://localhost:4000${path}`;
  };

  const getPlatformIcon = (platform) => {
    switch (platform) {
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

  const currentLive = live.length ? live[currentIndex] : null;

  return (
    <Container className={styles.container}>
      <ThemeProvider theme={darkTheme}>
        {/* Branding Section */}
        <Paper elevation={3} className={styles.sectionPaper}>
          <Typography variant="h3" gutterBottom sx={{ fontWeight: 800 }}>
            Midnight Sound Syndicate
          </Typography>
          <Typography variant="body1" gutterBottom sx={{ color: 'text.secondary', fontSize: '1.1rem' }}>
            Discover and stay connected
          </Typography>
        </Paper>

        {/* Twitch Carousel (Primary Section) */}
        <Paper elevation={3} className={styles.carouselSectionPaper}>
          {!currentLive ? (
            <Box className={styles.placeholderBox}>
              <FiberManualRecordIcon sx={{ fontSize: 64, color: 'error.main', opacity: 0.1, animation: 'pulse 3s infinite' }} />
              <Typography color="text.primary" variant="h6" sx={{ fontWeight: 700 }}>No one is live on the Syndicate right now.</Typography>
            </Box>
          ) : (
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
                  url={currentLive.playUrl} 
                  hlsUrl={currentLive.hlsUrl}
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
                
                {currentLive.twitchUrl && (
                  <Button 
                    href={currentLive.twitchUrl} 
                    target="_blank" 
                    variant="contained"
                    className={styles.openTwitchButton}
                  >
                    Open on Twitch
                  </Button>
                )}
              </Box>
            </Box>
          )}
        </Paper>

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
                      href={item.url} 
                      target="_blank" 
                      size="small" 
                      variant="outlined"
                      endIcon={<OpenInNewIcon sx={{ fontSize: 16 }} />}
                      className={styles.viewButton}
                    >
                      View
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
