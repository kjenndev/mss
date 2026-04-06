import { useParams } from 'react-router-dom';
import useSWR from 'swr';

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

// setup the fetcher for the SWR lib
const fetcher = (...args) => fetch(...args).then(res => res.json());

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
  },
});

// Component declaration
export default function ArtistDetail() {
    // Get the userId from the URL params
    const { id } = useParams();
    // Call the API and get the Artist by Id
    const { data, error, isLoading } = useSWR(`http://127.0.0.1:5000/artists/${id}`, fetcher);
    
    if (error) return <div>failed to load</div>
    if (isLoading) return <div>loading...</div>

    return (
        <Container>
            <ThemeProvider theme={darkTheme}>
                <Box component="form" noValidate autoComplete="off">
                    <Paper elevation={3} sx={{p: 5}}>
                        <Typography sx={{marginBottom: 5}} variant='h4'>Artist: {data.name}</Typography>
                        <br />  
                        <TableContainer>
                            <Table aria-label="simple table">
                            <TableBody>
                                <TableRow key="location">
                                    <TableCell sx={{width: '100px', border: 'none'}}><Typography>Location: </Typography></TableCell>
                                    <TableCell sx={{border: 'none'}}><Typography>{data.location}</Typography></TableCell>
                                </TableRow>
                                <TableRow key="description">
                                    <TableCell sx={{width: '100px', border: 'none'}}><Typography>Description: </Typography></TableCell>
                                    <TableCell sx={{border: 'none'}}><Typography>{data.description}</Typography></TableCell>
                                </TableRow>
                                <TableRow key="youtube">
                                    <TableCell sx={{width: '100px', border: 'none'}}><Typography>Youtube: </Typography></TableCell>
                                    <TableCell sx={{border: 'none'}}><Typography>{data.youtube}</Typography></TableCell>
                                </TableRow>
                                <TableRow key="twitch">
                                    <TableCell sx={{width: '100px', border: 'none'}}><Typography>Twitch: </Typography></TableCell>
                                    <TableCell sx={{border: 'none'}}><Typography>{data.twitch}</Typography></TableCell>
                                </TableRow>
                                <TableRow key="mixcloud">
                                    <TableCell sx={{width: '100px', border: 'none'}}><Typography>Mixcloud: </Typography></TableCell>
                                    <TableCell sx={{border: 'none'}}><Typography>{data.mixcloud}</Typography></TableCell>
                                </TableRow>
                                <TableRow key="soundcloud">
                                    <TableCell sx={{width: '100px', border: 'none'}}><Typography>Soundcloud: </Typography></TableCell>
                                    <TableCell sx={{border: 'none'}}><Typography>{data.soundcloud}</Typography></TableCell>
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