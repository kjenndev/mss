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
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import dayjs from 'dayjs';

import ArtistDropdown from '../Artist/Artist.Helper.DropDown';
import * as helpers from '../../Data.Helper.Api';
import styles from './Event.Component.Create.module.css';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#90caf9',
    },
  },
});

export default function CreateEvent() {
  const [event, setEvent] = useState({
    title: '',
    description: '',
    date: '',
    location: '',
    ticket_link: '',
    artist_ids: [],
  });
  const [flyer, setFlyer] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  function handleChange(e) {
    setEvent({ ...event, [e.target.name]: e.target.value });
  }

  function handleArtistUpdate(artistIds) {
    setEvent({ ...event, artist_ids: artistIds });
  }

  function handleFlyerChange(e) {
    if (e.target.files && e.target.files[0]) {
      setFlyer(e.target.files[0]);
    }
  }

  async function handleCreate() {
    if (!event.title.trim()) {
      setError('Event title is required.');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      const response = await helpers.CreateEvent(event);
      if (!response.ok) {
        const data = await response.json();
        setError(data.error || 'Unable to create event.');
        setLoading(false);
        return;
      }
      
      const { event: createdEvent } = await response.json();
      
      if (flyer) {
        const flyerResponse = await helpers.UploadEventFlyer(createdEvent.id, flyer);
        if (!flyerResponse.ok) {
            setError('Event created, but flyer upload failed.');
            setLoading(false);
            return;
        }
      }
      
      navigate(`/events/${createdEvent.id}`);
    } catch (err) {
      console.error(err);
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
              <Typography variant="h4" gutterBottom>Create New Event</Typography>
              <Typography variant="body2" color="text.secondary">
                Fill out the details for the upcoming event.
              </Typography>
            </Box>

            <Stack spacing={3}>
              <TextField 
                fullWidth
                label="Event Title" 
                name="title" 
                variant="outlined" 
                value={event.title} 
                onChange={handleChange}
                required
              />
              <DateTimePicker
                label="Date & Time"
                value={event.date ? dayjs(event.date) : null}
                onChange={(newValue) => setEvent({ ...event, date: newValue ? newValue.toISOString() : '' })}
                slotProps={{ textField: { fullWidth: true, variant: 'outlined' } }}
              />
              <TextField 
                fullWidth
                label="Location" 
                name="location" 
                variant="outlined" 
                value={event.location} 
                onChange={handleChange} 
              />
              <TextField 
                fullWidth
                label="Description" 
                name="description" 
                variant="outlined" 
                multiline 
                minRows={4} 
                value={event.description} 
                onChange={handleChange} 
              />
              <TextField 
                fullWidth
                label="Ticket Link" 
                name="ticket_link" 
                variant="outlined" 
                value={event.ticket_link} 
                onChange={handleChange} 
              />

              <Box className={styles.sectionBox}>
                <Typography variant="h6" className={styles.sectionHeader}>Attached Artists</Typography>
                <ArtistDropdown selectedIds={event.artist_ids} onUpdate={handleArtistUpdate} />
              </Box>

              <Box className={styles.sectionBox}>
                <Typography variant="h6" className={styles.sectionHeader}>Event Flyer</Typography>
                <input
                  accept="image/*"
                  style={{ display: 'none' }}
                  id="flyer-upload"
                  type="file"
                  onChange={handleFlyerChange}
                />
                <label htmlFor="flyer-upload">
                  <Button variant="outlined" component="span">
                    {flyer ? flyer.name : 'Choose Flyer Image'}
                  </Button>
                </label>
              </Box>
            </Stack>

            {error && <Alert severity="error">{error}</Alert>}

            <Box className={styles.formFooter}>
              <Button 
                variant="outlined" 
                onClick={() => navigate('/events')}
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
                {loading ? 'Creating...' : 'Create Event'}
              </Button>
            </Box>
          </Stack>
        </Paper>
      </ThemeProvider>
    </Container>
  );
}
