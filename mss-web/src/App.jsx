import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import './App.css'

import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';

import ArtistList from './components/Artist/Artist.Component.List'
import CreateArtist from './components/Artist/Artist.Component.Create'
import ArtistDetail from './components/Artist/Artist.Component.Detail'
import ArtistUpdate from './components/Artist/Artist.Component.Update'
import CreateUser from './components/User/User.Component.Create'

// 1. Define page components
const Home = () => (
  <div>
    <h1>Welcome to Midnight Sound Syndicate</h1>
  </div>
);

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
  },
});

// 3. Render the Provider
export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider theme={darkTheme}>
        <CssBaseline />
        {/* Navigation */}
        <div>
          <Box sx={{ flexGrow: 1 }}>
            <AppBar position="static">
              <Toolbar>
                <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
                  Midnight Sound Syndicate
                </Typography>
                <Button color="inherit" href='/'>Home</Button>
                <Button color="inherit" href='/artists'>Artists</Button>
                <Button color="inherit" href='/artists/create'>Create Artist</Button>
                <Button color="inherit" href='/users/create'>Create User</Button>
              </Toolbar>
            </AppBar>
          </Box>
        </div>
      </ThemeProvider>
      <br /><br />
      {/* Routes */}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/artists" element={<ArtistList />} />
        <Route path="/artists/:id" element={<ArtistDetail />} />
        <Route path="/artists/create" element={<CreateArtist />} />
        <Route path="/artists/:id/update" element={<ArtistUpdate />} />
        <Route path="/users/create" element={<CreateUser />} />
      </Routes>
    </BrowserRouter>
  )
}
