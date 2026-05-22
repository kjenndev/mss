import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Grid from '@mui/material/Grid';
import Avatar from '@mui/material/Avatar';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import YouTubeIcon from '@mui/icons-material/YouTube';
import CloudIcon from '@mui/icons-material/Cloud';
import QueueMusicIcon from '@mui/icons-material/QueueMusic';
import LiveTvIcon from '@mui/icons-material/LiveTv';

import * as helpers from '../../Data.Helper.Api';
import SyndicatePlayer from '../Stream/Syndicate.Player.Component';
import CommentSection from '../Comments/CommentSection';
import styles from './Artist.Component.Detail.module.css';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
  },
});

export default function ArtistDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [artist, setArtist] = useState(null);
  const [images, setImages] = useState([]);
  const [selectedImage, setSelectedImage] = useState(null);
  const [activeStream, setActiveStream] = useState(null);
  const [platformUrl, setPlatformUrl] = useState('http://localhost:5174');
  const [isStreamPaused, setIsStreamPaused] = useState(false);

  const getImageUrl = (path) => {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    return `http://localhost:4000${path}`;
  };

  useEffect(() => {
    helpers.GetArtistById(id).then(async (response) => {
      if (!response.ok) {
        navigate('/artists');
        return;
      }
      const data = await response.json();
      setArtist(data.artist);
    });
    helpers.GetArtistImages(id).then(async (response) => {
      if (response.ok) {
        const data = await response.json();
        setImages(data.images || []);
      }
    });

    helpers.GetSettings().then(async (res) => {
        if (res.ok) {
            const data = await res.json();
            if (data.settings?.streaming_platform_url) {
                setPlatformUrl(data.settings.streaming_platform_url);
            }
        }
    });

    helpers.GetActiveSyndicateStreams().then(async (response) => {
      if (response.ok) {
        const data = await response.json();
        const active = data.streams || [];
        const found = active.find(s => Number(s.artistId) === Number(id));
        setActiveStream(found || null);
      }
    });
  }, [id, navigate]);

  if (!artist) {
    return <Typography>Loading artist...</Typography>;
  }

  return (
    <Container maxWidth="lg" className={styles.container}>
      <ThemeProvider theme={darkTheme}>
        {/* Cover Photo Header */}
        <Box 
          className={styles.coverHeader}
          sx={{ backgroundImage: artist.cover_photo ? `url(${getImageUrl(artist.cover_photo)})` : 'none' }}
        >
          {/* Profile Header Card (Overlapping) */}
          <Paper elevation={4} className={styles.profileHeaderCard}>
            <Avatar sx={{ width: 150, height: 150 }}
              src={getImageUrl(artist.profile_picture)}
              alt={artist.name}
              className={styles.avatar}
            >
              {!artist.profile_picture && artist.name?.charAt(0)}
            </Avatar>

            <Box className={styles.headerInfo}>
              <Typography variant="h3" sx={{ fontWeight: 800, fontSize: { xs: '1.75rem', sm: '2.5rem' } }}>
                {artist.name}
              </Typography>
              <Typography color="text.secondary" sx={{ mt: 0.5, fontWeight: 500 }}>
                {artist.location || 'Location not set'}
              </Typography>
            </Box>

            {helpers.CanEditArtist(id, artist.user_id) && (
              <Button 
                variant="contained" 
                onClick={() => navigate(`/artists/${id}/update`)}
                className={styles.editButton}
              >
                Edit Profile
              </Button>
            )}
          </Paper>
        </Box>

        <Box className={styles.contentWrapper}>
          <Grid container spacing={4} alignItems="flex-start">
            {/* Sidebar Column: Gallery, Socials, Bio */}
            <Grid item xs={12} md={4} lg={3}>
              <Box className={styles.sidebar}>
                <Box className={styles.socialLinksRow}>
                  {artist.channel_name && (
                    <Tooltip title="Join Chat (Syndicate Live)">
                      <IconButton 
                        onClick={() => {
                            setIsStreamPaused(true);
                            window.open(`${platformUrl}/watch/${artist.channel_name}`, '_blank');
                        }}
                        rel="noopener noreferrer"
                        className={styles.socialIconTwitch + ' ' + styles.socialIconDefault}
                      >
                        <LiveTvIcon />
                      </IconButton>
                    </Tooltip>
                  )}
                  {artist.twitch && (
                    <Tooltip title="Twitch">
                      <IconButton 
                        component="a" 
                        href={`https://twitch.tv/${artist.twitch}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className={styles.socialIconTwitch + ' ' + styles.socialIconDefault}
                      >
                        <LiveTvIcon />
                      </IconButton>
                    </Tooltip>
                  )}
                  {artist.soundcloud && (
                    <Tooltip title="SoundCloud">
                      <IconButton 
                        component="a" 
                        href={artist.soundcloud} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className={styles.socialIconSoundCloud + ' ' + styles.socialIconDefault}
                      >
                        <CloudIcon />
                      </IconButton>
                    </Tooltip>
                  )}
                  {artist.mixcloud && (
                    <Tooltip title="Mixcloud">
                      <IconButton 
                        component="a" 
                        href={artist.mixcloud} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className={styles.socialIconMixcloud + ' ' + styles.socialIconDefault}
                      >
                        <QueueMusicIcon />
                      </IconButton>
                    </Tooltip>
                  )}
                  {artist.youtube && (
                    <Tooltip title="YouTube">
                      <IconButton 
                        component="a" 
                        href={artist.youtube} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className={styles.socialIconYouTube + ' ' + styles.socialIconDefault}
                      >
                        <YouTubeIcon />
                      </IconButton>
                    </Tooltip>
                  )}
                  {!artist.twitch && !artist.soundcloud && !artist.mixcloud && !artist.youtube && (
                    <Typography variant="body2" color="text.secondary" sx={{ pl: 1 }}>No links available</Typography>
                  )}
                </Box>

                <Box className={styles.aboutBox}>
                  <Typography variant="body2" className={styles.bioText}>
                    {artist.description || "No biography available."}
                  </Typography>
                </Box>

                <Typography variant="overline" className={styles.sectionLabel}>
                  Gallery
                </Typography>
                <Box className={styles.galleryGrid}>
                  {(() => {
                    const filteredImages = images.filter(image => 
                      image.url !== artist.profile_picture && 
                      image.url !== artist.cover_photo
                    );

                    if (filteredImages.length === 0) {
                      return (
                        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2, width: '100%' }}>
                          No additional photos yet
                        </Typography>
                      );
                    }

                    return filteredImages.map((image) => (
                      <Box 
                        key={image.url}
                        onClick={() => setSelectedImage(image.url)}
                        className={styles.galleryItem}
                      >
                        <img
                          src={getImageUrl(image.url)}
                          alt="artist upload"
                          className={styles.galleryImage}
                        />
                      </Box>
                    ));
                  })()}
                </Box>
              </Box>
            </Grid>

            {/* Main Column: Streams & Comments (Positioned to the Right) */}
            <Grid item xs={10} md={8} lg={9}>
              <Box className={styles.mainArea}>
                <Stack spacing={4}>
                  <Box>
                    <Stack spacing={4}>
                      {activeStream && artist.channel_name && (
                        <Box className={styles.streamBox}>
                          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                            <Typography variant="h6" sx={{ fontWeight: 600 }}>
                                Syndicate Live
                            </Typography>
                            <Button 
                                variant="contained" 
                                size="small"
                                onClick={() => {
                                    setIsStreamPaused(true);
                                    window.open(`${platformUrl}/watch/${artist.channel_name}`, '_blank');
                                }}
                                sx={{ borderRadius: '20px', textTransform: 'none', px: 3 }}
                            >
                                Join Chat
                            </Button>
                          </Box>
                          <SyndicatePlayer 
                            channelName={artist.channel_name}
                            isPaused={isStreamPaused}
                            onResume={() => setIsStreamPaused(false)}
                          />
                        </Box>
                      )}
                      {artist.soundcloud && (
                        <Box className={styles.streamBox}>
                          <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
                            SoundCloud
                          </Typography>
                          <iframe
                            width="100%"
                            height="450"
                            scrolling="no"
                            frameBorder="no"
                            allow="autoplay"
                            src={`https://w.soundcloud.com/player/?url=${encodeURIComponent(artist.soundcloud)}&color=%23ff5500&auto_play=false&hide_related=false&show_comments=true&show_user=true&show_reposts=false&show_teaser=true&visual=false`}
                            className={styles.streamIframe}
                          />
                        </Box>
                      )}

                      {artist.mixcloud && (
                        <Box className={styles.streamBox}>
                          <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
                            Mixcloud
                          </Typography>
                          <iframe
                            width="100%"
                            height="120"
                            src={`https://www.mixcloud.com/widget/iframe/?hide_cover=1&light=1&feed=${encodeURIComponent(artist.mixcloud)}`}
                            frameBorder="0"
                            allow="autoplay"
                            className={styles.streamIframe}
                          />
                        </Box>
                      )}

                      {artist.youtube && (
                        <Box className={styles.streamBox}>
                          <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
                            YouTube
                          </Typography>
                          <iframe
                            width="100%"
                            height="500"
                            src={artist.youtube.includes('watch?v=') ? artist.youtube.replace('watch?v=', 'embed/') : artist.youtube}
                            title="YouTube video player"
                            frameBorder="0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                            className={styles.streamIframe}
                          />
                        </Box>
                      )}
                    </Stack>
                  </Box>

                  <Box sx={{ mt: 6 }}>
                    <CommentSection artistId={artist.id} />
                  </Box>
                </Stack>
              </Box>
            </Grid>
          </Grid>
        </Box>

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
