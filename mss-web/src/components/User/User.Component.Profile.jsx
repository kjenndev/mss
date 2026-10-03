import { Checkbox, FormControlLabel } from '@mui/material';
import AccountEmail from './AccountEmail';
import AccountAvatar from './AccountAvatar';
import SaveIcon from '@mui/icons-material/Save';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
  const [originalUsername, setOriginalUsername] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const [loaded, setLoaded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [emailInfo, setEmailInfo] = useState({});
  const [alerts, setAlerts] = useState(false);
  const [alertsChanged, setAlertsChanged] = useState(false);

  useEffect(() => {
    let active = true;
    const sessionToken = localStorage.getItem('mss-token');
    const fetchUser = async () => {
      setLoading(true); setLoaded(false); setError('');
      try {
        const res = await helpers.GetCurrentUser();
        if (res.ok) {
          const data = await res.json();
          if (!data.user || typeof data.user.username !== 'string') throw new Error();
          if (!active) return;
          if (sessionToken !== localStorage.getItem('mss-token')) throw new Error('Session changed');
          setLoaded(true);
          setEmailInfo(data.user);
          setAlerts(Boolean(data.user.email_alerts_opt_in)); setAlertsChanged(false);
          setOriginalUsername(data.user.username);
          setUser({
            username: data.user.username,
            display_name: data.user.display_name || '',
            password: '',
            confirmPassword: ''
          });
        } else {
          throw new Error();
        }
      } catch {
        if (active) setError('Failed to load user data');
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchUser();
    return () => { active = false; };
  }, [navigate, attempt]);

  const handleChange = (e) => {
    setUser({ ...user, [e.target.name]: e.target.value });
  };

  const handleSave = async () => {
    if (!loaded || loading || saving) return;
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
        if (user.password.length < 5 || user.password.length > 1024) {
            setError('Password must be between 5 and 1024 characters');
            setSaving(false);
            return;
        }
    }

    try {
      const updateData = {
        username: user.username,
        display_name: user.display_name
      };
      if (alertsChanged) updateData.email_alerts_opt_in = alerts && Boolean(emailInfo.email_verified_at);
      if (user.password) {
        updateData.password = user.password;
      }

      const res = await helpers.UpdateMyProfile(updateData);
      if (res.ok) {
        if (user.password || user.username !== originalUsername) {
          helpers.clearSession();
          navigate('/login', { replace: true, state: { message: 'Account credentials updated. Please sign in again.' } });
          return;
        }
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
        <Box className={styles.content}>
          <Typography className={styles.eyebrow}>Your account</Typography>
          <Typography component="h1" variant="h4" className={styles.title}>Account Settings<span aria-hidden="true">.</span></Typography>

          <Stack spacing={3}>
            {loaded && <AccountAvatar key={emailInfo.id} user={emailInfo} />}
            <Box className={styles.groups}>
            <Box component="fieldset" className={styles.group}>
              <legend>Profile details</legend>
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

            </Box>
            <Box component="fieldset" className={styles.group}>
              <legend>Password</legend>
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
              slotProps={{ htmlInput: { minLength: 5, maxLength: 1024 } }}
                helperText="Use 5–1024 characters, or leave blank to keep your current password."
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

            </Box>
            </Box>

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            {!loaded && <Button onClick={() => setAttempt(n => n + 1)}>Retry</Button>}
            {loaded && <Box component="fieldset" className={styles.group}><legend>Email preferences</legend><FormControlLabel control={<Checkbox checked={alerts} disabled={saving || (!emailInfo.email_verified_at && !alerts)} onChange={e => { setAlerts(e.target.checked); setAlertsChanged(true); }} />} label="Receive email alerts about live streaming and upcoming events" />{!emailInfo.email_verified_at && <Typography variant="body2" color="text.secondary">Verify an email address before opting in. You can opt out at any time.</Typography>}</Box>}
            {loaded && <AccountEmail email={emailInfo.email} verified={Boolean(emailInfo.email_verified_at)} />}
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
                disabled={saving || !loaded}
                className={styles.saveButton}
                startIcon={saving ? <CircularProgress size={20} color="inherit" /> : <SaveIcon aria-hidden="true" />}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </Box>
          </Stack>
        </Box>
      </ThemeProvider>
    </Container>
  );
}
