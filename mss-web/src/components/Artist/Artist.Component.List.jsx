
import { Link } from 'react-router-dom';
import useSWR from 'swr';
import { mutate } from 'swr';

import Box from '@mui/material/Box';
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

// setup the fetcher for the SWR lib
const fetcher = (...args) => fetch(...args).then(res => res.json());

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
  },
});

// Component declaration
export default function ArtistList() {
  // Call the API and get the all the artists
  const { data, error, isLoading } = useSWR(`http://127.0.0.1:5000/artists`, fetcher);

  if (error) return <div>failed to load</div>
  if (isLoading) return <div>loading...</div> 

  // handles the delete callback
  function handleDelete(id) {
    // forces the SWR cache to update
    mutate('http://127.0.0.1:5000/artists', data.filter(artist => artist.id !== id), false);
  }

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
                            {data.map(artist => (
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
                                        <DeleteArtist id={artist.id} onDelete={handleDelete} /> 
                                    </TableCell>
                                </TableRow>
                            ))} 
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Paper>
            </ThemeProvider>
        </Container> 
    );
}