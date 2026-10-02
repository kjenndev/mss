import Alert from '@mui/material/Alert';
import { getImageUrl } from '../../config';
import { useState, useEffect } from 'react';
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
import styles from './Artist.Component.List.module.css';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
  },
});

export default function ArtistList() {
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [artists, setArtists] = useState([]);

  useEffect(() => {
    let active = true;
    helpers.GetAllArtists().then(async response => {
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (active) { setArtists(data.artists || []); setError(''); }
    }).catch(() => { if (active) setError('Unable to load artists.'); });
    return () => { active = false; };
  }, [attempt]);

  if (error) return <Alert severity="error">{error}<Button onClick={() => setAttempt(n => n + 1)}>Retry</Button></Alert>;

  return (
    <Container className={styles.container}>
      <ThemeProvider theme={darkTheme}>
        <Paper elevation={3} className={styles.headerPaper}>
          <Typography variant="h4">Syndicate Artists</Typography>
        </Paper>

        <Box className={styles.listWrapper}>
          <Grid container spacing={3} className={styles.cardGrid}>
            {artists.map((artist) => (
              <Grid size={{ xs: "auto" }} key={artist.id}>
                <Card className={styles.artistCard}>
                  {artist.profile_picture ? (
                    <CardMedia
                      component="img"
                      image={getImageUrl(artist.profile_picture)}
                      alt={artist.name}
                      className={styles.artistImage}
                    />
                  ) : (
                    <Box className={styles.placeholderImage}>
                        <Typography variant="h1" color="text.secondary">{artist.name.charAt(0)}</Typography>
                    </Box>
                  )}
                  <CardContent>
                    <Typography variant="h6" noWrap>{artist.name}</Typography>
                    <Typography color="text.secondary" noWrap>{artist.location || 'Unknown Location'}</Typography>
                  </CardContent>
                  <CardActions>
                    <Button
                      href={`/artists/${artist.id}`}
                      size="small"
                      variant="outlined"
                      sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 600 }}
                    >
                      View Profile
                    </Button>
                    {helpers.CanEditArtist(artist.id, artist.user_id) && (
                      <Button
                        href={`/artists/${artist.id}/update`}
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
      </ThemeProvider>
    </Container>
  );
}
