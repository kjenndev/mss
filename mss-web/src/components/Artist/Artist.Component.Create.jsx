import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import TextField from '@mui/material/TextField';
import Stack from '@mui/material/Stack';
import Grid from '@mui/material/Grid';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';

import UserDropdown from '../User/User.Helper.DropDown';
import * as helpers from '../../Data.Helper.Api';
import styles from './Artist.Component.Create.module.css';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#90caf9',
    },
  },
});

export default function CreateArtist() {
  const [artist, setArtist] = useState({
    name: '',
    location: '',
    description: '',
    twitch: '',
    soundcloud: '',
    mixcloud: '',
    youtube: '',
    user_id: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  function handleArtistChange(e) {
    setArtist({ ...artist, [e.target.name]: e.target.value });
  }

  async function handleCreate() {
    if (!artist.name.trim()) {
      setError('Artist name is required.');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      const response = await helpers.CreateArtist(artist);
      if (!response.ok) {
        const data = await response.json();
        setError(data.error || 'Unable to create artist.');
        setLoading(false);
        return;
      }
      navigate('/artists');
    } catch {
      setError('An unexpected error occurred.');
      setLoading(false);
    }
  }

  return (
    <Container maxWidth="md" className={styles.container}>
      <ThemeProvider theme={darkTheme}>
        <Paper elevation={4} className={styles.mainPaper}>
          <Stack spacing={4}>
            <Box>
              <Typography variant="h4" gutterBottom>Create New Artist Profile</Typography>
              <Typography variant="body2" color="text.secondary">
                Enter the details for the new artist. You can link this profile to an existing user account.
              </Typography>
            </Box>

            <Stack spacing={3}>
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
                value={artist.location} 
                onChange={handleArtistChange} 
              />
              <TextField 
                fullWidth
                label="Description" 
                name="description" 
                variant="outlined" 
                multiline 
                minRows={4} 
                value={artist.description} 
                onChange={handleArtistChange} 
              />

              <Box className={styles.sectionBox}>
                <Typography variant="h6" className={styles.sectionHeader}>Social & Streaming Links</Typography>
                
                <Stack spacing={3}>
                  <TextField 
                    fullWidth
                    label="Twitch Username" 
                    name="twitch" 
                    variant="outlined" 
                    value={artist.twitch} 
                    onChange={handleArtistChange} 
                  />
                  <TextField 
                    fullWidth
                    label="SoundCloud URL" 
                    name="soundcloud" 
                    variant="outlined" 
                    value={artist.soundcloud} 
                    onChange={handleArtistChange} 
                  />
                  <TextField 
                    fullWidth
                    label="Mixcloud URL" 
                    name="mixcloud" 
                    variant="outlined" 
                    value={artist.mixcloud} 
                    onChange={handleArtistChange} 
                  />
                  <TextField 
                    fullWidth
                    label="YouTube URL" 
                    name="youtube" 
                    variant="outlined" 
                    value={artist.youtube} 
                    onChange={handleArtistChange} 
                  />
                </Stack>
              </Box>

              <Box className={styles.sectionBox}>
                <Typography variant="h6" className={styles.sectionHeader}>User Management</Typography>
                <UserDropdown onUpdate={(userId) => setArtist({ ...artist, user_id: userId })} />
              </Box>
            </Stack>

            {error && <Alert severity="error">{error}</Alert>}

            <Box className={styles.formFooter}>
              <Button 
                variant="outlined" 
                onClick={() => navigate('/artists')}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button 
                variant="contained" 
                onClick={handleCreate}
                disabled={loading}
                startIcon={loading && <CircularProgress size={20} color="inherit" />}
              >
                {loading ? 'Creating...' : 'Create Artist'}
              </Button>
            </Box>
          </Stack>
        </Paper>
      </ThemeProvider>
    </Container>
  );
}
