import { useState, useRef } from 'react'
import { useParams } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';

import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import TextField from '@mui/material/TextField';
import Stack from '@mui/material/Stack';

import * as helpers from '../../Data.Helper.Api';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
  },
});

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

    const [artist, setArtist] = useState();

    useEffect(() => {
        helpers.GetArtistById(id).then(res => {
            if (res.status === 401) {
                localStorage.removeItem('session-id')
                localStorage.removeItem('session-userid')
                navigate("/login");
            }

            res.json().then(data => {
                setArtist(data);
            });
        });
    }, []);
    
    if (!artist) {
        return <Typography></Typography>
    }

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
                                    helpers.GetArtistById(id).then(res => {
                                        if (res.status === 401) {
                                            localStorage.removeItem('session-id')
                                            localStorage.removeItem('session-userid')
                                            navigate("/login");
                                        }

                                        res.json().then(data => {
                                            navigate('/artists');
                                        });
                                    });
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