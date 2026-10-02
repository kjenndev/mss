import Alert from '@mui/material/Alert';
import { getImageUrl } from '../../config';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import Container from '@mui/material/Container';
import Grid from '@mui/material/Grid';
import Card from '@mui/material/Card';
import Box from '@mui/material/Box';
import CardContent from '@mui/material/CardContent';
import CardActions from '@mui/material/CardActions';
import CardMedia from '@mui/material/CardMedia';

import * as helpers from '../../Data.Helper.Api';
import styles from './Event.Component.List.module.css';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
  },
});

export default function EventList() {
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [events, setEvents] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    helpers.GetAllEvents().then(async response => {
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (active) { setEvents(data.events || []); setError(''); }
    }).catch(() => { if (active) setError('Unable to load events.'); });
    return () => { active = false; };
  }, [attempt]);

  if (error) return <Alert severity="error">{error}<Button onClick={() => setAttempt(n => n + 1)}>Retry</Button></Alert>;

  return (
    <Container className={styles.container}>
      <ThemeProvider theme={darkTheme}>
        <Paper elevation={3} className={styles.mainWrapper}>
          <Box className={styles.headerBox}>
            <Typography variant="h4">Events</Typography>
            {helpers.HasSession() && (
              <Button variant="contained" color="primary" onClick={() => navigate('/events/create')}>
                Create Event
              </Button>
            )}
          </Box>

          <Box className={styles.listContent}>
            <Grid container spacing={3} className={styles.cardGrid}>
              {events.map((event) => (
                <Grid size={{ xs: "auto" }} key={event.id}>
                  <Card className={styles.eventCard}>
                    {event.flyer ? (
                      <CardMedia
                        component="img"
                        image={getImageUrl(event.flyer)}
                        alt={event.title}
                        className={styles.eventImage}
                      />
                    ) : (
                      <Box className={styles.placeholderImage}>
                          <Typography variant="h5" color="text.secondary">NO FLYER</Typography>
                      </Box>
                    )}
                    <CardContent>
                      <Typography variant="h6" noWrap>{event.title}</Typography>
                      <Typography color="text.secondary" noWrap>
                        {event.date ? (
                          `${new Date(event.date).toLocaleDateString([], { dateStyle: 'medium' })} @ ${new Date(event.date).toLocaleTimeString([], { timeStyle: 'short' })}`
                        ) : 'No Date'}
                      </Typography>
                      <Typography color="text.secondary" noWrap>{event.location || 'Unknown Location'}</Typography>
                    </CardContent>

                    <CardActions style={{ marginTop: 'auto' }}>
                      <Button
                        onClick={() => navigate(`/events/${event.id}`)}
                        size="small"
                        variant="outlined"
                        sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 600 }}
                      >
                        Details
                      </Button>
                      {helpers.CanEditEvent(event) && (
                        <Button
                          onClick={() => navigate(`/events/${event.id}/update`)}
                          size="small"
                          sx={{ textTransform: 'none' }}
                        >
                          Edit
                        </Button>
                      )}
                    </CardActions>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Box>
        </Paper>
      </ThemeProvider>
    </Container>
  );
}
