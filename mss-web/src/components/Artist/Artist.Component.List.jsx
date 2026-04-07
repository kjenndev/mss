import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import Container from '@mui/material/Container';

import DeleteArtist from './Artist.Component.Delete';
import * as helpers from '../../Data.Helper.Api';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
  },
});

// Component declaration
export default function ArtistList() {
    const [artists, setArtists] = useState([]);
    const navigate = useNavigate();

    useEffect(() => {
        // Side effect logic here
        helpers.GetAllArtists().then(response => {
            if (response.status === 401) {
                localStorage.removeItem('session-id')
                localStorage.removeItem('session-userid')
                navigate("/login");
            }
    
            response.json().then(res => {
                setArtists(res);
            });
        });
    }, []);

    return (
        <Container>
            <ThemeProvider theme={darkTheme}>
                <Paper elevation={3} sx={{p: 5}}>
                    <Typography sx={{marginBottom: 5}} variant='h4'>All Artists</Typography>
                    <br />  
                    <TableContainer>
                        <Table aria-label="simple table">
                            <TableHead>
                                <TableRow>
                                    <TableCell>Name</TableCell>
                                    <TableCell>Location</TableCell>
                                    <TableCell>Descruotion</TableCell>
                                    <TableCell>YouTube</TableCell>
                                    <TableCell>Twitch</TableCell>
                                    <TableCell>Mixcloud</TableCell>
                                    <TableCell>Soundcloud</TableCell>
                                    <TableCell></TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                            {
                                artists.map(artist => (
                                    <TableRow key={artist.name}>
                                        <TableCell>
                                            <Button href={`/artists/${artist.id}`}>{artist.name}</Button>
                                        </TableCell>
                                        <TableCell>{artist.location}</TableCell>
                                        <TableCell>{artist.description}</TableCell>
                                        <TableCell>{artist.youtube}</TableCell>
                                        <TableCell>{artist.twitch}</TableCell>
                                        <TableCell>{artist.mixcloud}</TableCell>
                                        <TableCell>{artist.soundcloud}</TableCell>
                                        <TableCell>
                                            <Button size="small" href={`/artists/${artist.id}/update`}>Update</Button>
                                            <DeleteArtist id={artist.id} onDelete = { id => {
                                                const newSet = artists.filter(a => a.id != id );
                                                setArtists(newSet);
                                            }} /> 
                                        </TableCell>
                                    </TableRow>
                                ))
                            } 
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Paper>
            </ThemeProvider>
        </Container> 
    );
}