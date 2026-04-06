import useSWRMutation from 'swr/mutation'
import useSWR from 'swr';
import { useState, useRef } from 'react'
import { useParams } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';

import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import TextField from '@mui/material/TextField';
import Stack from '@mui/material/Stack';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
  },
});

// setup the fetcher for the SWR lib
const fetcher = (...args) => fetch(...args).then(res => res.json());

// Component declaration
export default function ArtistUpdate() {
    // Get the Id from the URL params
    const { id } = useParams();
    // Setup the navigator
    const navigate = useNavigate();

    // handle any textbox change events
    function handleArtistChange(e) {
        artist[e.target.name] = e.target.value;
        setArtist(artist);
    }

    // manually handle the API call with this override
    async function UpdateArtist(url, artist) {
        await fetch(url, {
            method: 'PUT',
            body: JSON.stringify(artist)
        });
    }
    // Call the API and get the Artist by Id
    const { data, error, isLoading } = useSWR(`http://127.0.0.1:5000/artists/${id}`, fetcher, { suspense: true });
    
    if (error) return <div>failed to load</div>
    if (isLoading) return <div>loading...</div>

    // Set a state object for Artist
    const [artist, setArtist] = useState(data);
    // Setup the trigger event 
    const { trigger } = useSWRMutation(`http://127.0.0.1:5000/artists/${id}`, UpdateArtist, { suspense: true });

    return (
        <Container>
            <ThemeProvider theme={darkTheme}>
                <Box component="form" noValidate autoComplete="off">
                    <Paper elevation={3} sx={{p: 5}}>
                        <Stack>
                                <Typography sx={{marginBottom: 5}} variant='h4'>Update Artist {artist.name}</Typography>
                                <TextField id="standard-basic" sx={{marginBottom: 5}} label="Artist Name" name='name' variant="standard" defaultValue={artist.name} onChange={(e)=>{ handleArtistChange(e) }} />
                                <TextField id="standard-basic" sx={{marginBottom: 5}} label="Location" name='location' variant="standard" defaultValue={artist.location} onChange={(e)=>{ handleArtistChange(e) }} />
                                <TextField id="standard-basic" sx={{marginBottom: 5}} label="Description" name='description' variant="standard" defaultValue={artist.description} onChange={(e)=>{ handleArtistChange(e) }} />
                                <TextField id="standard-basic" sx={{marginBottom: 5}} label="YouTube" name='youtube' variant="standard" defaultValue={artist.youtube} onChange={(e)=>{ handleArtistChange(e) }} />
                                <TextField id="standard-basic" sx={{marginBottom: 5}} label="Twitch" name='twitch' variant="standard" defaultValue={artist.twitch} onChange={(e)=>{ handleArtistChange(e) }} />
                                <TextField id="standard-basic" sx={{marginBottom: 5}} label="Mixcloud" name='mixcloud' variant="standard" defaultValue={artist.mixcloud} onChange={(e)=>{ handleArtistChange(e) }} />
                                <TextField id="standard-basic" sx={{marginBottom: 5}} label="Soundcloud" name='soundcloud' variant="standard" defaultValue={artist.soundcloud} onChange={(e)=>{ handleArtistChange(e) }} />
                            
                                <Button onClick={() => {
                                    // Call trigger event passing in thje new artist
                                    trigger(artist);
                                    navigate('/artists');

                                    }}>
                                        Update Artist
                                </Button>
                        </Stack>            
                    </Paper>
                </Box>
            </ThemeProvider>
        </Container>
  );
}