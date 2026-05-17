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

  function handleAuthChange(e) {
    setUser({ ...user, [e.target.name]: e.target.value });
  }

  async function handleLogin() {
    const response = await helpers.Authenticate(user);
    if (!response.ok) {
      setError('Invalid username or password');
      return;
    }
    navigate('/');
  }

  return (
    <Container className={styles.container}>
      <ThemeProvider theme={darkTheme}>
        <Box component="form" noValidate autoComplete="off" className={styles.loginBox}>
          <Paper elevation={3} className={styles.loginPaper}>
            <Stack>
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
              <Button onClick={handleLogin} variant="contained" className={styles.loginButton}>Login</Button>
            </Stack>
          </Paper>
        </Box>
      </ThemeProvider>
    </Container>
  );
}
