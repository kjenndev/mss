import { useParams } from 'react-router-dom';
import { useState, useEffect } from 'react';

import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableRow from '@mui/material/TableRow';

import * as helpers from '../../Data.Helper.Api';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
  },
});

// Component declaration
export default function ArtistDetail() {
    // Get the userId from the URL params
    const { id } = useParams();
    const [artist, setArtist] = useState();
    // Call the API and get the Artist by Id
    useEffect(() => {
        // Side effect logic here
        helpers.GetArtistById(id).then(response => {
            if (response.status === 401) {
                localStorage.removeItem('session-id')
                localStorage.removeItem('session-userid')
                navigate("/login");
            }
    
            response.json().then(res => {
                setArtist(res);
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
                        <Typography sx={{marginBottom: 5}} variant='h4'>Artist: {artist.name}</Typography>
                        <br />  
                        <TableContainer>
                            <Table aria-label="simple table">
                            <TableBody>
                                <TableRow key="location">
                                    <TableCell sx={{width: '100px', border: 'none'}}><Typography>Location: </Typography></TableCell>
                                    <TableCell sx={{border: 'none'}}><Typography>{artist.location}</Typography></TableCell>
                                </TableRow>
                                <TableRow key="description">
                                    <TableCell sx={{width: '100px', border: 'none'}}><Typography>Description: </Typography></TableCell>
                                    <TableCell sx={{border: 'none'}}><Typography>{artist.description}</Typography></TableCell>
                                </TableRow>
                                <TableRow key="youtube">
                                    <TableCell sx={{width: '100px', border: 'none'}}><Typography>Youtube: </Typography></TableCell>
                                    <TableCell sx={{border: 'none'}}><Typography>{artist.youtube}</Typography></TableCell>
                                </TableRow>
                                <TableRow key="twitch">
                                    <TableCell sx={{width: '100px', border: 'none'}}><Typography>Twitch: </Typography></TableCell>
                                    <TableCell sx={{border: 'none'}}><Typography>{artist.twitch}</Typography></TableCell>
                                </TableRow>
                                <TableRow key="mixcloud">
                                    <TableCell sx={{width: '100px', border: 'none'}}><Typography>Mixcloud: </Typography></TableCell>
                                    <TableCell sx={{border: 'none'}}><Typography>{artist.mixcloud}</Typography></TableCell>
                                </TableRow>
                                <TableRow key="soundcloud">
                                    <TableCell sx={{width: '100px', border: 'none'}}><Typography>Soundcloud: </Typography></TableCell>
                                    <TableCell sx={{border: 'none'}}><Typography>{artist.soundcloud}</Typography></TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    </TableContainer>
                    </Paper>
                </Box>
            </ThemeProvider>
        </Container>
    );
}