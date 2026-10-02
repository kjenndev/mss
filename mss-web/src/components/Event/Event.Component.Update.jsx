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
  return <EventEditor key={id} />;
}

function EventEditor() {
  const { id } = useParams();
  const active = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
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
  const [dateError, setDateError] = useState(false);
  const [dateValue, setDateValue] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [flyer, setFlyer] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    helpers.GetEventById(id).then(async (res) => {
      if (cancelled) return;
      if (res.ok) {
        const data = await res.json();
        if (cancelled) return;
        const evt = data.event;
        if (!helpers.CanEditEvent(evt)) { setForbidden(true); return; }
        setDateValue(evt.date ? dayjs(evt.date) : null);
        setEvent({
          title: evt.title || '',
          description: evt.description || '',
          date: evt.date || null,
          location: evt.location || '',
          ticket_link: evt.ticket_link || '',
          artist_ids: evt.artists ? evt.artists.map(a => a.id) : [],
          flyer_artist_name: evt.flyer_artist_name || '',
          flyer_artist_url: evt.flyer_artist_url || '',
        });
      } else {
        throw new Error('Unable to load event.');
      }
    }).catch(() => { if (!cancelled) setLoadError('Unable to load event.'); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id, attempt]);

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
    if (dateError) return;
    if (!event.title.trim()) {
      setError('Event title is required.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const response = await helpers.UpdateEvent(id, event);
      if (!active.current) return;
      if (!response.ok) {
        const data = await response.json();
        if (!active.current) return;
        setError(data.error || 'Unable to update event.');
        setSaving(false);
        return;
      }

      if (flyer) {
        const flyerResponse = await helpers.UploadEventFlyer(id, flyer);
        if (!active.current) return;
        if (!flyerResponse.ok) {
            setError('Event updated, but flyer upload failed.');
            setSaving(false);
            return;
        }
      }

      navigate(`/events/${id}`);
    } catch (err) {
      if (!active.current) return;
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
            if (!active.current) return;
            if (response.ok) {
                navigate('/events');
            } else {
                setError('Failed to delete event.');
                setSaving(false);
            }
        } catch (err) {
      if (!active.current) return;
            console.error(err);
            setError('An error occurred while deleting.');
            setSaving(false);
        }
    }
  }

  if (forbidden) return <Alert severity="error">You are not authorized to edit this event.</Alert>;
  if (loadError) return <Alert severity="error">{loadError}<Button onClick={() => { setLoading(true); setLoadError(''); setAttempt(n => n + 1); }}>Retry</Button></Alert>;
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
                <Stack spacing={3}>
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
                    {flyer ? flyer.name : 'Change Flyer Image'}
                  </Button>
                </label>
              </Box>
            </Stack>

            {dateError && <Alert severity="error">Enter a valid date or clear the date.</Alert>}
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
