import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
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

  const getImageUrl = (path) => {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    return `http://localhost:4000${path}`;
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        const [artistRes, imagesRes] = await Promise.all([
          helpers.GetArtistManageData(id),
          helpers.GetArtistImages(id)
        ]);

        if (!artistRes.ok) {
          navigate('/login');
          return;
        }

        const artistData = await artistRes.json();
        setArtist(artistData.artist);

        if (imagesRes.ok) {
          const imagesData = await imagesRes.json();
          setImages(imagesData.images || []);
        }

        if (isAdmin) {
          const usersRes = await helpers.GetAllUsers();
          if (usersRes.ok) {
            const usersData = await usersRes.json();
            setUsers(usersData.users || []);
          }
        }
      } catch {
        setError('Failed to load artist data');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [id, navigate, isAdmin]);

  function handleArtistChange(e) {
    setArtist({ ...artist, [e.target.name]: e.target.value });
  }

  function handleUserChange(e) {
    setArtist({ ...artist, user_id: e.target.value });
  }

  async function handleImageUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError('');

    try {
      const response = await helpers.UploadArtistImage(id, file);
      if (!response.ok) {
        const data = await response.json();
        setError(data.error || 'Upload failed');
      } else {
        // Refresh images and artist (for profile pic update)
        const [newImagesRes, newArtistRes] = await Promise.all([
          helpers.GetArtistImages(id),
          helpers.GetArtistById(id)
        ]);
        if (newImagesRes.ok) setImages((await newImagesRes.json()).images);
        if (newArtistRes.ok) setArtist((await newArtistRes.json()).artist);
      }
    } catch {
      setError('An error occurred during upload');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleDeleteImage(imageId) {
    if (!window.confirm('Are you sure you want to delete this image?')) return;

    try {
      const response = await helpers.DeleteArtistImage(id, imageId);
      if (response.ok) {
        setImages(images.filter(img => img.id !== imageId));
        // Refresh artist in case profile pic was deleted
        const artistRes = await helpers.GetArtistById(id);
        if (artistRes.ok) setArtist((await artistRes.json()).artist);
      } else {
        setError('Failed to delete image');
      }
    } catch {
      setError('An error occurred while deleting the image');
    }
  }

  async function handleSetProfilePicture(url) {
    try {
      const response = await helpers.UpdateArtist({ ...artist, profile_picture: url });
      if (response.ok) {
        const data = await response.json();
        setArtist(data.artist);
      } else {
        setError('Failed to update profile picture');
      }
    } catch {
      setError('An error occurred while updating profile picture');
    }
  }

  async function handleSetCoverPhoto(url) {
    try {
      const response = await helpers.UpdateArtist({ ...artist, cover_photo: url });
      if (response.ok) {
        const data = await response.json();
        setArtist(data.artist);
      } else {
        setError('Failed to update cover photo');
      }
    } catch {
      setError('An error occurred while updating cover photo');
    }
  }

  async function handleUpdate() {
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
      }
      
      const response = await helpers.UpdateArtist(updateData);
      if (!response.ok) {
        const errorData = await response.json();
        setError(errorData.error || 'Unable to update the artist');
        setSaving(false);
        return;
      }
      navigate(`/artists/${id}`);
    } catch {
      setError('An unexpected error occurred while saving');
      setSaving(false);
    }
  }

  async function handleRegenerateKey() {
    if (!window.confirm('Warning: This will immediately invalidate your old stream key. You will need to update OBS before you can stream again. Continue?')) {
        return;
    }

    try {
        const res = await helpers.RegenerateStreamKey(id);
        if (res.ok) {
            const data = await res.json();
            setArtist({ ...artist, stream_key: data.stream_key });
        } else {
            setError('Failed to regenerate stream key');
        }
    } catch {
        setError('An error occurred while regenerating the key');
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
        <Alert severity="error">Artist not found</Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="md" className={styles.container}>
      <ThemeProvider theme={darkTheme}>
        <Paper elevation={4} className={styles.mainPaper}>
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
                <Typography variant="h4" gutterBottom>Update Artist Profile</Typography>
                <Typography variant="body2" color="text.secondary">
                  Manage your details, social links, and gallery.
                </Typography>
              </Box>

              <Stack spacing={3}>
                <Box>
                  <Typography variant="h6" className={styles.galleryLabel}>Gallery Management</Typography>
                  <Grid container spacing={2} className={styles.galleryGrid}>
                    {images.map((image) => (
                      <Grid item xs={6} sm={4} md={3} key={image.id}>
                        <Card className={styles.galleryCard}>
                          <CardMedia
                            component="img"
                            image={getImageUrl(image.url)}
                            alt="artist upload"
                            className={styles.galleryImage}
                          />
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
                          {artist.profile_picture === image.url && (
                            <Box className={styles.profilePicBadge}>
                              PROFILE PIC
                            </Box>
                          )}
                          {artist.cover_photo === image.url && (
                            <Box className={artist.profile_picture === image.url ? styles.coverPhotoBadge + ' ' + styles.coverPhotoBadgeWithProfile : styles.coverPhotoBadge + ' ' + styles.coverPhotoBadgeAlone}>
                              COVER PHOTO
                            </Box>
                          )}
                        </Card>
                      </Grid>
                    ))}
                    <Grid item xs={6} sm={4} md={3}>
                      <Card className={styles.uploadCard} onClick={() => fileInputRef.current?.click()}>
                        {uploading ? <CircularProgress size={24} /> : <Typography variant="h3" color="text.secondary">+</Typography>}
                      </Card>
                      <input type="file" hidden ref={fileInputRef} onChange={handleImageUpload} accept="image/*" />
                    </Grid>
                  </Grid>
                </Box>

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
                
                <Box className={styles.sectionBox}>
                  <Typography variant="h6" className={styles.sectionHeader}>Social & Streaming Links</Typography>
                </Box>
                
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
                  label="YouTube URL" 
                  name="youtube" 
                  variant="outlined" 
                  value={artist.youtube || ''} 
                  onChange={handleArtistChange} 
                  placeholder="https://youtube.com/..."
                />

                <Box sx={{ pt: 1 }}>
                  <Typography variant="h6" className={styles.sectionHeader}>Streaming Configuration</Typography>
                  <Typography variant="caption" color="error" sx={{ mb: 2, display: 'block' }}>
                    Warning: Your Twitch Stream Key is private. Do not share it.
                  </Typography>
                </Box>

                <TextField 
                  fullWidth
                  label="Twitch Stream Key" 
                  name="twitch_stream_key" 
                  variant="outlined" 
                  type="password"
                  value={artist.twitch_stream_key || ''} 
                  onChange={handleArtistChange} 
                  placeholder="Paste your Twitch stream key here"
                />

                <Box sx={{ mt: 2, p: 3, bgcolor: 'rgba(144, 202, 249, 0.05)', borderRadius: 2, border: '1px solid rgba(144, 202, 249, 0.1)' }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'primary.main' }}>
                        Syndicate RTMP Connection Details
                    </Typography>
                    <Button 
                        size="small" 
                        color="warning" 
                        variant="outlined" 
                        onClick={handleRegenerateKey}
                        sx={{ textTransform: 'none', fontWeight: 700 }}
                    >
                        Regenerate Key
                    </Button>
                  </Stack>

                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Use these settings in OBS to stream directly to the Syndicate hub and Twitch simultaneously.
                  </Typography>
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', color: 'text.secondary' }}>Server URL</Typography>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', bgcolor: 'rgba(0,0,0,0.3)', p: 1, borderRadius: 1, mb: 2 }}>
                      rtmp://localhost:1935/live
                    </Typography>
                    
                    <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', color: 'text.secondary' }}>Stream Key</Typography>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', bgcolor: 'rgba(0,0,0,0.3)', p: 1, borderRadius: 1, overflowWrap: 'break-word' }}>
                      {artist.slug}/{artist.stream_key}
                    </Typography>
                  </Box>
                </Box>

                {isAdmin && (
                  <Box className={styles.sectionBox}>
                    <Typography variant="h6" className={styles.sectionHeader}>User Management</Typography>
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

              {error && <Alert severity="error">{error}</Alert>}

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
                  startIcon={saving && <CircularProgress size={20} color="inherit" />}
                  className={styles.saveButton}
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
              </Box>
            </Stack>
          </Box>
        </Paper>
      </ThemeProvider>
    </Container>
  );
}
