import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import TextField from '@mui/material/TextField';
import Stack from '@mui/material/Stack';

import * as helpers from '../../Data.Helper.Api';
import styles from './Auth.Component.Login.module.css';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
  },
});

export default function Login() {
  const [user, setUser] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(false);

  function handleAuthChange(e) {
    setUser({ ...user, [e.target.name]: e.target.value });
  }

  async function handleLogin() {
    setLoading(true); setError('');
    try {
      const response = await helpers.Authenticate(user);
      if (!response.ok) {
        const data = await response.json();
        setError(data.error || 'Unable to sign in. Please retry.');
        return;
      }
      navigate('/');
    } catch { setError('Unable to reach the server. Please retry.'); }
    finally { setLoading(false); }
  }

  return (
    <Container className={styles.container}>
      <ThemeProvider theme={darkTheme}>
        <Box component="form" noValidate autoComplete="off" className={styles.loginBox}>
          <Paper elevation={3} className={styles.loginPaper}>
            <Stack>
              {location.state?.message && <Typography role="status">{location.state.message}</Typography>}
              <Typography className={styles.loginTitle} variant="h4">
                Login
              </Typography>
              <TextField
                id="username"
                className={styles.inputField}
                label="Username"
                name="username"
                variant="standard"
                value={user.username}
                onChange={handleAuthChange}
                fullWidth
              />
              <TextField
                id="password"
                className={styles.inputField}
                label="Password"
                name="password"
                type="password"
                variant="standard"
                value={user.password}
                onChange={handleAuthChange}
                fullWidth
              />
              {error && <Typography color="error" className={styles.errorText}>{error}</Typography>}
              <Button disabled={loading} onClick={handleLogin} variant="contained" className={styles.loginButton}>Login</Button>
            </Stack>
          </Paper>
        </Box>
      </ThemeProvider>
    </Container>
  );
}
