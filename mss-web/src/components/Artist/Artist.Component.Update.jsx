import ArtistVisibility from './ArtistVisibility';
import SaveIcon from '@mui/icons-material/Save';
import RefreshIcon from '@mui/icons-material/Refresh';
import { getImageUrl } from '../../config';
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Typography from '@mui/material/Typography';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Button from '@mui/material/Button';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import TextField from '@mui/material/TextField';
import Stack from '@mui/material/Stack';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import CircularProgress from '@mui/material/CircularProgress';
import Grid from '@mui/material/Grid';
import Alert from '@mui/material/Alert';
import Avatar from '@mui/material/Avatar';
import Card from '@mui/material/Card';
import CardMedia from '@mui/material/CardMedia';
import IconButton from '@mui/material/IconButton';
import DeleteIcon from '@mui/icons-material/Delete';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import ImageIcon from '@mui/icons-material/Image';
import Tooltip from '@mui/material/Tooltip';

import * as helpers from '../../Data.Helper.Api';
import styles from './Artist.Component.Update.module.css';
import YouTubeLinks from '../Media/YouTubeLinks';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#90caf9',
    },
    secondary: {
      main: '#f48fb1',
    },
  },
});

export default function ArtistUpdate() {
  const { id } = useParams();
  return <ArtistEditor key={id} />;
}

function ArtistEditor() {
  const { id } = useParams();
  const active = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const [attempt, setAttempt] = useState(0);
  const [tab, setTab] = useState(0);
  const [artist, setArtist] = useState(null);
  const [images, setImages] = useState([]);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const isAdmin = helpers.IsAdmin();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);


  useEffect(() => {
    let cancelled = false;
    const loadData = async () => {
      try {
        const [artistRes, imagesRes] = await Promise.all([
          helpers.GetArtistManageData(id),
          helpers.GetArtistImages(id)
        ]);

        if (cancelled) return;
        if (!artistRes.ok) {
          if (artistRes.status === 401) { navigate('/login'); return; }
          throw new Error(artistRes.status === 403 ? 'You are not authorized to edit this artist.' : 'Failed to load artist data');
        }

        const artistData = await artistRes.json();
        if (cancelled) return;
        setArtist(artistData.artist);

        if (imagesRes.ok) {
          const imagesData = await imagesRes.json();
          if (cancelled) return;
          setImages(imagesData.images || []);
        }

        if (isAdmin) {
          const usersRes = await helpers.GetAllUsers();
          if (usersRes.ok) {
            const usersData = await usersRes.json();
            if (cancelled) return;
            setUsers(usersData.users || []);
          }
        }
      } catch (err) {
        if (cancelled) return;
        setError(err.message || 'Failed to load artist data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadData();
    return () => { cancelled = true; };
  }, [id, navigate, isAdmin, attempt]);

  function handleArtistChange(e) {
    setArtist({ ...artist, [e.target.name]: e.target.value });
  }

  function handleUserChange(e) {
    setArtist({ ...artist, user_id: e.target.value === '' ? null : e.target.value });
  }

  async function handleImageUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError('');

    try {
      const response = await helpers.UploadArtistImage(id, file);
      if (!active.current) return;
      if (!response.ok) {
        const data = await response.json();
        if (!active.current) return;
        setError(data.error || 'Upload failed');
      } else {
        // Refresh images and artist (for profile pic update)
        const [newImagesRes, newArtistRes] = await Promise.all([
          helpers.GetArtistImages(id),
          helpers.GetArtistById(id)
        ]);
        if (!active.current) return;
        if (newImagesRes.ok) { const data = await newImagesRes.json(); if (!active.current) return; setImages(data.images); }
        if (newArtistRes.ok) { const { artist: fresh } = await newArtistRes.json(); if (!active.current) return; setArtist(draft => ({ ...draft, profile_picture: fresh.profile_picture, cover_photo: fresh.cover_photo })); }
      }
    } catch {
      if (!active.current) return;
      setError('An error occurred during upload');
    } finally {
      if (active.current) {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    }
  }

  async function handleDeleteImage(imageId) {
    if (!window.confirm('Are you sure you want to delete this image?')) return;

    try {
      const response = await helpers.DeleteArtistImage(id, imageId);
      if (!active.current) return;
      if (response.ok) {
        setImages(current => current.filter(img => img.id !== imageId));
        // Refresh artist in case profile pic was deleted
        const artistRes = await helpers.GetArtistById(id);
        if (!active.current) return;
        if (artistRes.ok) { const { artist: fresh } = await artistRes.json(); if (!active.current) return; setArtist(draft => ({ ...draft, profile_picture: fresh.profile_picture, cover_photo: fresh.cover_photo })); }
      } else {
        setError('Failed to delete image');
      }
    } catch {
      if (!active.current) return;
      setError('An error occurred while deleting the image');
    }
  }

  async function handleSetProfilePicture(url) {
    try {
      const response = await helpers.UpdateArtist({ id, profile_picture: url });
      if (!active.current) return;
      if (response.ok) {
        const data = await response.json();
        if (!active.current) return;
        setArtist(draft => ({ ...draft, profile_picture: data.artist.profile_picture, cover_photo: data.artist.cover_photo }));
      } else {
        setError('Failed to update profile picture');
      }
    } catch {
      if (!active.current) return;
      setError('An error occurred while updating profile picture');
    }
  }

  async function handleSetCoverPhoto(url) {
    try {
      const response = await helpers.UpdateArtist({ id, cover_photo: url });
      if (!active.current) return;
      if (response.ok) {
        const data = await response.json();
        if (!active.current) return;
        setArtist(draft => ({ ...draft, profile_picture: data.artist.profile_picture, cover_photo: data.artist.cover_photo }));
      } else {
        setError('Failed to update cover photo');
      }
    } catch {
      if (!active.current) return;
      setError('An error occurred while updating cover photo');
    }
  }

  async function handleUpdate() {
    if (isAdmin && artist.channel_name && !/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(artist.channel_name)) { setError('Channel name must be 1–100 letters, numbers, underscores or hyphens and start with a letter or number.'); return; }
    if (!artist.name.trim()) {
      setError('Artist name is required');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const updateData = { ...artist };
      if (!isAdmin) {
        delete updateData.user_id;
        delete updateData.channel_name;
      }

      const response = await helpers.UpdateArtist(updateData);
      if (!active.current) return;
      if (!response.ok) {
        const errorData = await response.json();
        if (!active.current) return;
        setError(errorData.error || 'Unable to update the artist');
        setSaving(false);
        return;
      }
      navigate(`/artists/${id}`);
    } catch {
      if (!active.current) return;
      setError('An unexpected error occurred while saving');
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!artist) {
    return (
      <Container className={styles.container}>
        <Alert severity="error">{error || 'Artist not found'}<Button startIcon={<RefreshIcon aria-hidden="true" />} onClick={() => { setLoading(true); setError(''); setAttempt(n => n + 1); }}>Retry</Button></Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="md" className={styles.container}>
      <ThemeProvider theme={darkTheme}>
        <Box className={styles.mainPaper}>
          {/* Cover Photo Preview */}
          <Box
            className={styles.coverPreview}
            sx={{ backgroundImage: artist.cover_photo ? `url(${getImageUrl(artist.cover_photo)})` : 'none' }}
          >
            <Avatar
              src={getImageUrl(artist.profile_picture)}
              alt={artist.name}
              sx={{ width: 80, height: 80 }}
              className={styles.avatarPreview}
            >
              {!artist.profile_picture && artist.name?.charAt(0)}
            </Avatar>
          </Box>

          <Box className={styles.formContent}>
            <Stack spacing={4}>
              <Box>
                <Typography className={styles.eyebrow}>Artist management</Typography>
                <Typography component="h1" className={styles.title}>Update Artist Profile<span aria-hidden="true">.</span></Typography>
                <Typography variant="body2" color="text.secondary">
                  Manage your details, social links, and gallery.
                </Typography>
              </Box>

              <Tabs value={tab} onChange={(_event, value) => setTab(value)} aria-label="Artist profile sections" variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile className={styles.tabs}>
                {['Details', 'Gallery Management', 'YouTube Links'].map((label, index) => (
                  <Tab key={label} type="button" label={label} id={`artist-editor-tab-${index}`} aria-controls={`artist-editor-panel-${index}`} />
                ))}
              </Tabs>

              {/* Keep panels mounted so switching never discards drafts or in-flight media state. */}
              <Box role="tabpanel" id="artist-editor-panel-0" aria-labelledby="artist-editor-tab-0" hidden={tab !== 0}>
              <Stack spacing={3}>
                <ArtistVisibility artist={artist} busy={saving} onChange={is_disabled => setArtist(draft => ({ ...draft, is_disabled }))} />
                <Box component="section" aria-label="Artist details" className={styles.detailsSection}>
                  <Typography component="h2" variant="h6" className={styles.sectionHeader}>Artist details</Typography>
                  <Box className={styles.fields}>
                    <TextField
                      fullWidth
                      label="Artist Name"
                      name="name"
                      variant="outlined"
                      value={artist.name}
                      onChange={handleArtistChange}
                      required
                    />
                    <TextField
                      fullWidth
                      label="Location"
                      name="location"
                      variant="outlined"
                      value={artist.location || ''}
                      onChange={handleArtistChange}
                    />
                    <TextField
                      fullWidth
                      label="Description"
                      name="description"
                      variant="outlined"
                      multiline
                      minRows={4}
                      value={artist.description || ''}
                      onChange={handleArtistChange}
                    />
                  </Box>
                </Box>

                <Box component="section" aria-label="Social & Streaming Links" className={styles.sectionBox}>
                  <Typography component="h2" variant="h6" className={styles.sectionHeader}>Social & Streaming Links</Typography>
                  <Box className={styles.fields}>
                    <TextField
                      fullWidth
                      label="Twitch Username"
                      name="twitch"
                      variant="outlined"
                      value={artist.twitch || ''}
                      onChange={handleArtistChange}
                      placeholder="e.g. yourname"
                    />
                    <TextField
                      fullWidth
                      label="Streaming Platform Channel Name"
                      name="channel_name"
                      disabled={!isAdmin}
                      helperText="Admin-only manual mapping. Use the exact existing SP channel; SP accounts are managed separately."
                      variant="outlined"
                      value={artist.channel_name || ''}
                      onChange={handleArtistChange}
                      placeholder="e.g. kyle-stream"
                    />
                    <TextField
                      fullWidth
                      label="SoundCloud URL"
                      name="soundcloud"
                      variant="outlined"
                      value={artist.soundcloud || ''}
                      onChange={handleArtistChange}
                      placeholder="https://soundcloud.com/..."
                    />
                    <TextField
                      fullWidth
                      label="Mixcloud URL"
                      name="mixcloud"
                      variant="outlined"
                      value={artist.mixcloud || ''}
                      onChange={handleArtistChange}
                      placeholder="https://mixcloud.com/..."
                    />
                    <TextField
                      fullWidth
                      label="YouTube Channel URL"
                      name="youtube"
                      variant="outlined"
                      value={artist.youtube || ''}
                      onChange={handleArtistChange}
                      placeholder="https://youtube.com/..."
                    />
                  </Box>
                </Box>

                {isAdmin && (
                  <Box component="section" aria-label="User Management" className={styles.sectionBox}>
                  <Typography component="h2" variant="h6" className={styles.sectionHeader}>User Management</Typography>
                    <FormControl fullWidth variant="outlined">
                      <InputLabel id="user-label">Associated User (Admin Only)</InputLabel>
                      <Select
                        labelId="user-label"
                        id="user-select"
                        value={artist.user_id || ''}
                        onChange={handleUserChange}
                        label="Associated User (Admin Only)"
                      >
                        <MenuItem value=""><em>None</em></MenuItem>
                        {users.map((user) => (
                          <MenuItem key={user.id} value={user.id}>
                            {user.username} ({user.role})
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Box>
                )}
              </Stack>

              <Typography variant="body2" color="text.secondary" sx={{ my: 2 }}>Save Changes applies to the details above. Visibility, gallery actions and YouTube links save separately when used.</Typography>
              <Box className={styles.formFooter}>
                <Button
                  variant="outlined"
                  onClick={() => navigate(`/artists/${id}`)}
                  disabled={saving}
                  className={styles.cancelButton}
                >
                  Cancel
                </Button>
                <Button
                  variant="contained"
                  onClick={handleUpdate}
                  disabled={saving}
                  startIcon={saving ? <CircularProgress size={20} color="inherit" /> : <SaveIcon aria-hidden="true" />}
                  className={styles.saveButton}
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
              </Box>
              </Box>

              <Box role="tabpanel" id="artist-editor-panel-1" aria-labelledby="artist-editor-tab-1" hidden={tab !== 1}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Gallery actions save immediately. Unsaved details are kept when switching tabs.</Typography>
              <Box component="section" aria-label="Gallery Management" className={styles.sectionBox}>
                  <Typography component="h2" variant="h6" className={styles.galleryLabel}>Gallery Management</Typography>
                  <Grid container spacing={2} className={styles.galleryGrid}>
                    {images.map((image) => (
                      <Grid size={{ xs: 6, sm: 4, md: 3 }} key={image.id}>
                        <Card className={styles.galleryCard}>
                          <Box className={styles.imageFrame}>
                          <Box className={styles.designations}>
                          {artist.profile_picture === image.url && (
                            <Box className={styles.profilePicBadge}>
                              PROFILE PIC
                            </Box>
                          )}
                          {artist.cover_photo === image.url && (
                            <Box className={styles.coverPhotoBadge}>
                              COVER PHOTO
                            </Box>
                          )}
                          </Box>
                          <CardMedia
                            component="img"
                            image={getImageUrl(image.url)}
                            alt="artist upload"
                            className={styles.galleryImage}
                          />
                          </Box>
                          <Box className={styles.imageActionsOverlay}>
                            <Tooltip title="Delete Image">
                              <IconButton size="small" color="error" onClick={() => handleDeleteImage(image.id)}>
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Set as Profile Picture">
                              <IconButton
                                size="small"
                                color={artist.profile_picture === image.url ? "primary" : "default"}
                                onClick={() => handleSetProfilePicture(image.url)}
                              >
                                <AccountCircleIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Set as Cover Photo">
                              <IconButton
                                size="small"
                                color={artist.cover_photo === image.url ? "secondary" : "default"}
                                onClick={() => handleSetCoverPhoto(image.url)}
                              >
                                <ImageIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        </Card>
                      </Grid>
                    ))}
                    <Grid size={{ xs: 6, sm: 4, md: 3 }}>
                      <Card component="button" type="button" aria-label="Upload gallery image" disabled={uploading} className={styles.uploadCard} onClick={() => fileInputRef.current?.click()}>
                        {uploading ? <CircularProgress size={24} /> : <Typography component="span" color="text.secondary">Upload image</Typography>}
                      </Card>
                      <input type="file" hidden ref={fileInputRef} onChange={handleImageUpload} accept="image/*" />
                    </Grid>
                  </Grid>
                </Box>

              </Box>

              <Box role="tabpanel" id="artist-editor-panel-2" aria-labelledby="artist-editor-tab-2" hidden={tab !== 2}>
                {helpers.CanEditArtist(id, artist.user_id) && <YouTubeLinks key={id} artistId={id} />}
              </Box>

              {error && <Alert severity="error">{error}</Alert>}
            </Stack>
          </Box>
        </Box>
      </ThemeProvider>
    </Container>
  );
}
