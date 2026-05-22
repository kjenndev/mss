import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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

export default function UpdateEvent() {
  const { id } = useParams();
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    helpers.GetEventById(id).then(async (res) => {
      if (res.ok) {
        const data = await res.json();
        const evt = data.event;
        setEvent({
          title: evt.title || '',
          description: evt.description || '',
          date: evt.date || '',
          location: evt.location || '',
          ticket_link: evt.ticket_link || '',
          artist_ids: evt.artists ? evt.artists.map(a => a.id) : [],
        });
      } else {
        navigate('/events');
      }
      setLoading(false);
    });
  }, [id, navigate]);

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

  async function handleUpdate() {
    if (!event.title.trim()) {
      setError('Event title is required.');
      return;
    }
    
    setSaving(true);
    setError('');
    
    try {
      const response = await helpers.UpdateEvent(id, event);
      if (!response.ok) {
        const data = await response.json();
        setError(data.error || 'Unable to update event.');
        setSaving(false);
        return;
      }
      
      if (flyer) {
        const flyerResponse = await helpers.UploadEventFlyer(id, flyer);
        if (!flyerResponse.ok) {
            setError('Event updated, but flyer upload failed.');
            setSaving(false);
            return;
        }
      }
      
      navigate(`/events/${id}`);
    } catch (err) {
      console.error(err);
      setError('An unexpected error occurred.');
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (window.confirm('Are you sure you want to delete this event?')) {
        setSaving(true);
        try {
            const response = await helpers.DeleteEvent(id);
            if (response.ok) {
                navigate('/events');
            } else {
                setError('Failed to delete event.');
                setSaving(false);
            }
        } catch (err) {
            console.error(err);
            setError('An error occurred while deleting.');
            setSaving(false);
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

  return (
    <Container maxWidth="md" className={styles.container}>
      <ThemeProvider theme={darkTheme}>
        <Paper elevation={4} className={styles.mainPaper}>
          <Stack spacing={4}>
            <Box display="flex" justifyContent="space-between" alignItems="center">
              <Box>
                <Typography variant="h4" gutterBottom>Update Event</Typography>
                <Typography variant="body2" color="text.secondary">
                  Update the details for this event.
                </Typography>
              </Box>
              <Button color="error" onClick={handleDelete}>Delete Event</Button>
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
                    {flyer ? flyer.name : 'Change Flyer Image'}
                  </Button>
                </label>
              </Box>
            </Stack>

            {error && <Alert severity="error">{error}</Alert>}

            <Box className={styles.formFooter}>
              <Button 
                variant="outlined" 
                onClick={() => navigate(`/events/${id}`)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button 
                variant="contained" 
                onClick={handleUpdate}
                disabled={saving}
                startIcon={saving && <CircularProgress size={20} color="inherit" />}
              >
                {saving ? 'Updating...' : 'Update Event'}
              </Button>
            </Box>
          </Stack>
        </Paper>
      </ThemeProvider>
    </Container>
  );
}
