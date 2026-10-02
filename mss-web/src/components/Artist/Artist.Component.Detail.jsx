import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import RefreshIcon from '@mui/icons-material/Refresh';
import EditIcon from '@mui/icons-material/Edit';
import Alert from '@mui/material/Alert';
import { poll } from '../../poll';
import { getImageUrl, watchUrl } from '../../config';
import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import Typography from '@mui/material/Typography';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Grid from '@mui/material/Grid';
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
import MediaLibrary from '../Media/MediaLibrary';
import { useMediaPlayer } from '../Media/MediaPlayerContext';
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
  return <ArtistDetailContent key={id} id={id} />;
}
function ArtistDetailContent({ id }) {
  const mediaPlayer = useMediaPlayer();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [streamError, setStreamError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [artist, setArtist] = useState(null);
  const [images, setImages] = useState([]);
  const [failedPortrait, setFailedPortrait] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [activeStream, setActiveStream] = useState(null);
  const [platformUrl, setPlatformUrl] = useState('');
  const [isStreamPaused, setIsStreamPaused] = useState(false);


  useEffect(() => {
    let active = true;
    setError('');
    Promise.all([helpers.GetArtistById(id), helpers.GetArtistImages(id), helpers.GetSettings()]).then(async ([artistRes, imagesRes, settingsRes]) => {
      if (!artistRes.ok || !imagesRes.ok || !settingsRes.ok) throw new Error('Unable to load artist data.');
      const [artistData, imagesData, settingsData] = await Promise.all([artistRes.json(), imagesRes.json(), settingsRes.json()]);
      if (active) {
        setArtist(artistData.artist); setImages(imagesData.images || []);
        setPlatformUrl(settingsData.settings?.streaming_platform_url || '');
      }
    }).catch(() => { if (active) setError('Unable to load artist data.'); });
    const stop = poll(async () => {
      try {
        const response = await helpers.GetActiveSyndicateStreams();
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (active) { setActiveStream((data.streams || []).find(s => Number(s.artistId) === Number(id)) || null); setStreamError(''); }
      } catch { if (active) { setActiveStream(null); setStreamError('Live status unavailable. Retrying automatically.'); } }
    });
    return () => { active = false; stop(); };
  }, [id, attempt]);

  if (error) return <Alert severity="error">{error}<Button startIcon={<RefreshIcon aria-hidden="true" />} onClick={() => setAttempt(n => n + 1)}>Retry</Button></Alert>;
  if (!artist) {
    return <Typography>Loading artist...</Typography>;
  }

  return (
    <Container maxWidth="lg" className={styles.container}>
      <ThemeProvider theme={darkTheme}>
        <Box className={styles.breadcrumb}><a href="/artists">Artists</a><span aria-hidden="true"> / </span>{artist.name}</Box>
        {artist.cover_photo && <img className={styles.coverPhoto} src={getImageUrl(artist.cover_photo)} alt={`${artist.name} cover`} />}
        <Box className={styles.contentWrapper}>
          {streamError && <Alert severity="warning">{streamError}</Alert>}
          {artist.channel_name && !watchUrl(platformUrl, artist.channel_name) && <Alert severity="warning">Streaming platform is not configured.</Alert>}
          <Grid container spacing={{ xs: 4, md: 6 }} alignItems="flex-start">
            {/* Sidebar Column: Gallery, Socials, Bio */}
            <Grid size={{ xs: 12, md: 4, lg: 4 }}>
              <Box className={styles.sidebar}>
                <Typography className={styles.eyebrow}>Midnight Sound Syndicate</Typography>
                <Typography component="h1" className={styles.artistName}>{artist.name}<span aria-hidden="true">.</span></Typography>
                <Typography color="text.secondary" className={styles.location}>{artist.location || 'Location not set'}</Typography>
                {artist.profile_picture && failedPortrait !== artist.profile_picture ? <img onError={() => setFailedPortrait(artist.profile_picture)} className={styles.portrait} src={getImageUrl(artist.profile_picture)} alt={artist.name} /> : <Box className={styles.portraitFallback}><span aria-hidden="true">{artist.name?.charAt(0)}</span><Typography>No artist photo yet</Typography></Box>}
                {helpers.CanEditArtist(id, artist.user_id) && <Button startIcon={<EditIcon aria-hidden="true" />} variant="outlined" onClick={() => navigate(`/artists/${id}/update`)} className={styles.editButton}>Edit Profile</Button>}
                <Box className={styles.aboutBox}>
                  <Typography className={styles.sectionLabel}>Behind the sound</Typography>
                  <Typography component="h2" variant="h6">About {artist.name}</Typography>
                  <Typography className={styles.bioText}>{artist.description || 'No biography available.'}</Typography>
                </Box>

                <Box className={styles.socialLinksRow}>
                  {watchUrl(platformUrl, artist.channel_name) && (
                    <Tooltip title="Open platform player (Syndicate Live)">
                      <IconButton
                        onClick={() => {
                            setIsStreamPaused(true);
                            window.open(watchUrl(platformUrl, artist.channel_name), '_blank', 'noopener,noreferrer');
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
                  {!artist.twitch && !artist.soundcloud && !artist.mixcloud && !artist.youtube && !watchUrl(platformUrl, artist.channel_name) && (
                    <Typography variant="body2" color="text.secondary" sx={{ pl: 1 }}>No links available</Typography>
                  )}
                </Box>

                <Typography variant="overline" className={styles.sectionLabel}>
                  In the frame · Gallery
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

                    return filteredImages.map((image, index) => (
                      <Box
                        component="button"
                        type="button"
                        aria-label={`Open gallery photo ${index + 1}`}
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
            <Grid size={{ xs: 12, md: 8, lg: 8 }}>
              <Box className={styles.mainArea}>
                <Stack spacing={4}>
                  <MediaLibrary artistId={id} renderIntro={({ canListen, listenToLatest }) => (
                    <Box className={styles.editorial}>
                      <Typography className={styles.eyebrow}>The artist collection</Typography>
                      <Typography component="h2" className={styles.collectionTitle}>A space for the sound.</Typography>
                      <Typography className={styles.collectionCopy}>Tracks and mixes, together.<br />Explore {artist.name}’s uploads across SoundCloud and Mixcloud.</Typography>
                      <Button variant="contained" startIcon={<PlayArrowIcon aria-hidden="true" />} disabled={!canListen} onClick={listenToLatest}>Listen to latest</Button>
                    </Box>
                  )} />
                  <Box>
                    <Stack spacing={4}>
                      {mediaPlayer?.item ? ((artist.youtube || (activeStream && watchUrl(platformUrl, artist.channel_name))) ? <Box><Typography>Artist video is paused while you listen to the library.</Typography><Button onClick={mediaPlayer.close}>Switch to artist video</Button></Box> : null) : <>
                      {activeStream && watchUrl(platformUrl, artist.channel_name) && (
                        <Box className={styles.streamBox}>
                          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                            <Typography variant="h6" sx={{ fontWeight: 600 }}>
                                Syndicate Live
                            </Typography>
                            <Button startIcon={<OpenInNewIcon aria-hidden="true" />}
                                variant="contained"
                                size="small"
                                onClick={() => {
                                    setIsStreamPaused(true);
                                    window.open(watchUrl(platformUrl, artist.channel_name), '_blank', 'noopener,noreferrer');
                                }}
                                sx={{ borderRadius: '20px', textTransform: 'none', px: 3 }}
                            >
                                Open platform player
                            </Button>
                          </Box>
                          <SyndicatePlayer
                            channelName={artist.channel_name}
                            isPaused={isStreamPaused}
                            onResume={() => setIsStreamPaused(false)}
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
                      </>}
                    </Stack>
                  </Box>

                  <Box className={styles.discussion}>
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
          slotProps={{ paper: { className: styles.lightboxOverlay, 'aria-label': 'Artist gallery' } }}
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
