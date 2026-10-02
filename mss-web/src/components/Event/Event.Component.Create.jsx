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
    date: null,
    location: '',
    ticket_link: '',
    artist_ids: [],
    flyer_artist_name: '',
    flyer_artist_url: '',
  });
  const [createdId, setCreatedId] = useState(null);
  const [flyer, setFlyer] = useState(null);
  const [dateError, setDateError] = useState(false);
  const [dateValue, setDateValue] = useState(null);
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
    if (dateError) return;
    if (!event.title.trim()) {
      setError('Event title is required.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      let eventId = createdId;
      if (!eventId) {
        const response = await helpers.CreateEvent(event);
        if (!response.ok) {
          const data = await response.json();
          setError(data.error || 'Unable to create event.');
          setLoading(false);
          return;
        }
        const { event: createdEvent } = await response.json();
        eventId = createdEvent.id;
        setCreatedId(eventId);
      }
      if (flyer) {
        const flyerResponse = await helpers.UploadEventFlyer(eventId, flyer);
        if (!flyerResponse.ok) {
            setError('Event created, but flyer upload failed.');
            setLoading(false);
            return;
        }
      }

      navigate(`/events/${eventId}`);
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

            <Stack spacing={3} component="fieldset" disabled={Boolean(createdId)} sx={{ border: 0, p: 0, m: 0 }}>
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
                value={dateValue}
                onChange={(value) => { setDateValue(value); const invalid = value !== null && !value.isValid(); setDateError(invalid); if (!invalid) setEvent({ ...event, date: value ? value.toISOString() : null }); }}
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
                <Typography variant="h6" className={styles.sectionHeader}>Flyer Artist Credit</Typography>
                <Stack spacing={3} component="fieldset" disabled={Boolean(createdId)} sx={{ border: 0, p: 0, m: 0 }}>
                  <TextField
                    fullWidth
                    label="Flyer Artist Name"
                    name="flyer_artist_name"
                    variant="outlined"
                    value={event.flyer_artist_name}
                    onChange={handleChange}
                  />
                  <TextField
                    fullWidth
                    label="Flyer Artist URL"
                    name="flyer_artist_url"
                    variant="outlined"
                    value={event.flyer_artist_url}
                    onChange={handleChange}
                  />
                </Stack>
              </Box>

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

            {dateError && <Alert severity="error">Enter a valid date or clear the date.</Alert>}
            {error && <Alert severity="error">{error}</Alert>}
            {createdId && <Button onClick={() => navigate(`/events/${createdId}/update`)}>Continue to saved event</Button>}

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
                {loading ? 'Saving...' : createdId ? 'Retry flyer upload' : 'Create Event'}
              </Button>
            </Box>
          </Stack>
        </Paper>
      </ThemeProvider>
    </Container>
  );
}
