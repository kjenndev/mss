import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import Container from '@mui/material/Container';
import TextField from '@mui/material/TextField';
import Stack from '@mui/material/Stack';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import InputLabel from '@mui/material/InputLabel';
import FormControl from '@mui/material/FormControl';

import * as helpers from '../../Data.Helper.Api';
import styles from './User.Component.Create.module.css';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
  },
});

export default function CreateUser() {
  const [user, setUser] = useState({ username: '', password: '', role: 'artist', artist_id: '' });
  const [artists, setArtists] = useState([]);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    helpers.GetAllArtists().then(async (response) => {
      if (response.ok) {
        const data = await response.json();
        setArtists(data.artists || []);
      }
    });
  }, []);

  function handleUserChange(e) {
    setUser({ ...user, [e.target.name]: e.target.value });
  }

  async function handleCreateUser() {
    if (!user.username || !user.password) {
      setError('Username and password are required.');
      return;
    }

    const userData = { ...user };
    if (userData.artist_id === '') {
      delete userData.artist_id;
    }

    const response = await helpers.CreateUser(userData);
    if (!response.ok) {
      const data = await response.json();
      setError(data.error || 'Unable to create user.');
      return;
    }

    navigate('/admin/dashboard');
  }

  return (
    <Container className={styles.container}>
      <ThemeProvider theme={darkTheme}>
        <Paper elevation={3} className={styles.mainPaper}>
          <Stack spacing={3}>
            <Typography variant="h4">Create New User</Typography>
            <TextField label="Username" name="username" variant="standard" value={user.username} onChange={handleUserChange} fullWidth />
            <TextField label="Password" name="password" type="password" variant="standard" value={user.password} onChange={handleUserChange} fullWidth />
            <FormControl variant="standard" fullWidth>
              <InputLabel id="role-label">Role</InputLabel>
              <Select labelId="role-label" name="role" value={user.role} onChange={handleUserChange}>
                <MenuItem value="artist">Artist</MenuItem>
                <MenuItem value="admin">Admin</MenuItem>
              </Select>
            </FormControl>
            <FormControl variant="standard" fullWidth>
              <InputLabel id="artist-label">Associated Artist (optional)</InputLabel>
              <Select labelId="artist-label" name="artist_id" value={user.artist_id} onChange={handleUserChange}>
                <MenuItem value="">
                  <em>None</em>
                </MenuItem>
                {artists.map((artist) => (
                  <MenuItem key={artist.id} value={artist.id}>
                    {artist.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {error && <Typography color="error">{error}</Typography>}
            <Button variant="contained" onClick={handleCreateUser}>
              Create User
            </Button>
          </Stack>
        </Paper>
      </ThemeProvider>
    </Container>
  );
}
