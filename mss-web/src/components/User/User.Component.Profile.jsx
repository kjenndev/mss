import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import TextField from '@mui/material/TextField';
import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';

import * as helpers from '../../Data.Helper.Api';
import styles from './User.Component.Profile.module.css';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#90caf9',
    },
  },
});

export default function UserProfile() {
  const [user, setUser] = useState({ username: '', display_name: '', password: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await helpers.GetCurrentUser();
        if (res.ok) {
          const data = await res.json();
          setUser({ 
            username: data.user.username, 
            display_name: data.user.display_name || '', 
            password: '', 
            confirmPassword: '' 
          });
        } else {
          navigate('/login');
        }
      } catch {
        setError('Failed to load user data');
      } finally {
        setLoading(false);
      }
    };
    fetchUser();
  }, [navigate]);

  const handleChange = (e) => {
    setUser({ ...user, [e.target.name]: e.target.value });
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');

    // Password validation
    if (user.password || user.confirmPassword) {
        if (user.password !== user.confirmPassword) {
            setError('Passwords do not match');
            setSaving(false);
            return;
        }
        if (user.password.length < 4) {
            setError('Password must be at least 4 characters');
            setSaving(false);
            return;
        }
    }

    try {
      const updateData = { 
        username: user.username,
        display_name: user.display_name
      };
      if (user.password) {
        updateData.password = user.password;
      }

      const res = await helpers.UpdateMyProfile(updateData);
      if (res.ok) {
        setSuccess('Profile updated successfully');
        setUser({ ...user, password: '', confirmPassword: '' });
        // Update local storage if username changed
        localStorage.setItem('mss-user', user.username);
        window.dispatchEvent(new CustomEvent('mss-auth-change'));
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to update profile');
      }
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Container className={styles.container}>
      <ThemeProvider theme={darkTheme}>
        <Paper elevation={4} className={styles.profilePaper}>
          <Typography variant="h4" className={styles.title}>Account Settings</Typography>
          
          <Stack spacing={3}>
            <TextField
              label="Username"
              name="username"
              value={user.username}
              onChange={handleChange}
              fullWidth
              className={styles.inputField}
              variant="outlined"
            />

            <TextField
              label="Display Name"
              name="display_name"
              value={user.display_name}
              onChange={handleChange}
              fullWidth
              className={styles.inputField}
              variant="outlined"
              helperText="This is the name that will show with your comments."
            />
            
            <TextField
              label="New Password"
              name="password"
              type="password"
              value={user.password}
              onChange={handleChange}
              placeholder="Leave blank to keep current"
              fullWidth
              className={styles.inputField}
              variant="outlined"
              helperText="Only fill this out if you want to change your password."
            />

            <TextField
              label="Confirm New Password"
              name="confirmPassword"
              type="password"
              value={user.confirmPassword}
              onChange={handleChange}
              fullWidth
              className={styles.inputField}
              variant="outlined"
            />

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

            <Box className={styles.footer}>
              <Button 
                variant="outlined" 
                onClick={() => navigate(-1)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button 
                variant="contained" 
                onClick={handleSave}
                disabled={saving}
                className={styles.saveButton}
                startIcon={saving && <CircularProgress size={20} color="inherit" />}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </Box>
          </Stack>
        </Paper>
      </ThemeProvider>
    </Container>
  );
}
