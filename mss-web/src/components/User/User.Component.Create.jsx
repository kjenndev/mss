import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import TextField from '@mui/material/TextField';
import Stack from '@mui/material/Stack';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';

import * as helpers from '../../Data.Helper.Api';
import styles from './User.Component.Create.module.css';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#90caf9',
    },
  },
});

export default function CreateUser() {
  const [user, setUser] = useState({ 
    username: '', 
    display_name: '',
    password: '', 
    role: 'artist' 
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  function handleUserChange(e) {
    setUser({ ...user, [e.target.name]: e.target.value });
  }

  async function handleCreate() {
    if (!user.username.trim() || !user.password.trim()) {
      setError('Username and password are required.');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      const response = await helpers.CreateUser(user);
      if (!response.ok) {
        const data = await response.json();
        setError(data.error || 'Unable to create user.');
        setLoading(false);
        return;
      }
      navigate('/admin/dashboard');
    } catch {
      setError('An unexpected error occurred.');
      setLoading(false);
    }
  }

  return (
    <Container maxWidth="sm" className={styles.container}>
      <ThemeProvider theme={darkTheme}>
        <Paper elevation={4} sx={{ p: 4, borderRadius: 2 }}>
          <Stack spacing={4}>
            <Box>
              <Typography variant="h4" gutterBottom>Create New User</Typography>
              <Typography variant="body2" color="text.secondary">
                Manually create a new user account.
              </Typography>
            </Box>

            <Stack spacing={3}>
              <TextField 
                fullWidth
                label="Username" 
                name="username" 
                variant="outlined" 
                value={user.username} 
                onChange={handleUserChange}
                required
              />
              <TextField 
                fullWidth
                label="Display Name" 
                name="display_name" 
                variant="outlined" 
                value={user.display_name} 
                onChange={handleUserChange}
                placeholder="Name shown in comments"
              />
              <TextField 
                fullWidth
                label="Password" 
                name="password" 
                type="password"
                variant="outlined" 
                value={user.password} 
                onChange={handleUserChange}
                required
              />
              <FormControl fullWidth variant="outlined">
                <InputLabel id="role-label">User Role</InputLabel>
                <Select
                  labelId="role-label"
                  name="role"
                  value={user.role}
                  onChange={handleUserChange}
                  label="User Role"
                >
                  <MenuItem value="artist">Artist</MenuItem>
                  <MenuItem value="admin">Administrator</MenuItem>
                  <MenuItem value="user">Standard User</MenuItem>
                </Select>
              </FormControl>
            </Stack>

            {error && <Alert severity="error">{error}</Alert>}

            <Box display="flex" justifyContent="flex-end" gap={2}>
              <Button 
                variant="outlined" 
                onClick={() => navigate('/admin/dashboard')}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button 
                variant="contained" 
                onClick={handleCreate}
                disabled={loading}
                startIcon={loading && <CircularProgress size={20} color="inherit" />}
              >
                {loading ? 'Creating...' : 'Create User'}
              </Button>
            </Box>
          </Stack>
        </Paper>
      </ThemeProvider>
    </Container>
  );
}
