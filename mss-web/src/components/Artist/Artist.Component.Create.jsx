import { useState, useEffect } from 'react'
import UserDropdown from '../User/User.Helper.DropDown';
import { useNavigate } from 'react-router-dom';

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

// Component Declaration
export default function CreateArtist() {
    var selectedUserId = -1;

    const navigate = useNavigate();

    // Set a state object for Artist
    const [artist, setArtist] = useState({
        id: -1,
        name: '',
        location: '',
        description: '',
        youtube: '',
        twitch: '',
        soundcloud: '',
        mixcloud: '',
        userid: -1
    });

    // handle when the select value changes
    function handleArtistChange(e) {
        let _artist = {
            id: artist.id,
            name: artist.name,
            location: artist.location,
            description: artist.description,
            youtube: artist.youtube,
            twitch: artist.twitch,
            soundcloud: artist.soundcloud,
            mixcloud: artist.mixcloud,
            userid: artist.userid
        };
   
        _artist[e.target.name] = e.target.value;
        setArtist(_artist);
    }

    return (
        <Container>
            <ThemeProvider theme={darkTheme}>
                <Box component="form" noValidate autoComplete="off">
                    <Paper elevation={3} sx={{p: 5}}>
                        <Stack>
                                <Typography sx={{marginBottom: 5}} variant='h4'>Create New Artist</Typography>
                                <UserDropdown onUpdate={(userId) => {  selectedUserId = userId; artist.userid = userId; setArtist(artist); }} />
                                <br />
                                <TextField id="standard-basic" sx={{marginBottom: 5}} label="Artist Name" name='name' variant="standard" defaultValue={artist.name} onChange={(e)=>{ handleArtistChange(e) }} />
                                <TextField id="standard-basic" sx={{marginBottom: 5}} label="Location" name='location' variant="standard" defaultValue={artist.location} onChange={(e)=>{ handleArtistChange(e) }} />
                                <TextField id="standard-basic" sx={{marginBottom: 5}} label="Description" name='description' variant="standard" defaultValue={artist.description} onChange={(e)=>{ handleArtistChange(e) }} />
                                <TextField id="standard-basic" sx={{marginBottom: 5}} label="YouTube" name='youtube' variant="standard" defaultValue={artist.youtube} onChange={(e)=>{ handleArtistChange(e) }} />
                                <TextField id="standard-basic" sx={{marginBottom: 5}} label="Twitch" name='twitch' variant="standard" defaultValue={artist.twitch} onChange={(e)=>{ handleArtistChange(e) }} />
                                <TextField id="standard-basic" sx={{marginBottom: 5}} label="Mixcloud" name='mixcloud' variant="standard" defaultValue={artist.mixcloud} onChange={(e)=>{ handleArtistChange(e) }} />
                                <TextField id="standard-basic" sx={{marginBottom: 5}} label="Soundcloud" name='soundcloud' variant="standard" defaultValue={artist.soundcloud} onChange={(e)=>{ handleArtistChange(e) }} />
                            
                                <Button onClick={() => {
                                    helpers.CreateArtist(artist).then(res => {
                                        if (res.status === 401) {
                                            localStorage.removeItem('session-id')
                                            localStorage.removeItem('session-userid')
                                            navigate("/login");
                                        } else {
                                            res.json().then(data => {
                                            navigate('/artists');
                                        });
                                        }
                                    });
                                }}>
                                        Create Artist
                                </Button>
                        </Stack>            
                    </Paper>
                </Box>
            </ThemeProvider>
        </Container>
  );
}