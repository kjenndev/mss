import { useState } from 'react'
import { useNavigate } from 'react-router-dom';
import { md5 } from 'js-md5';
import { useEffect } from 'react';

import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import TextField from '@mui/material/TextField';
import Stack from '@mui/material/Stack';

import * as helpers from '../../Data.Helper.Api';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
  },
});

// Component Declaration
export default function Login() {
    // Clear the current session
    helpers.ClearSession();

    // Setup a state object for User
    const [user, setUser] = useState({username: '', password: ''});
    const navigate = useNavigate();
    const encoder = new TextEncoder();

    // Handle when a textbox value changes
    function handleAuthChange(e) {
        let _user = user;
        if (e.target.name === 'password'){
            _user.password = md5(encoder.encode(e.target.value));
        } else {
            _user[e.target.name] = e.target.value;
        }
        setUser(_user);
    }

    return (
        <Container>
            <ThemeProvider theme={darkTheme}>
                <Box component="form" noValidate autoComplete="off">
                    <Paper elevation={3} sx={{p: 5}}>
                        <Box sx={{width: 600}}>
                            <Stack>
                                <Typography sx={{marginBottom: 5}} variant='h4'>Login</Typography>
                                <TextField id="username" sx={{marginBottom: 5}} label="Username" name='username' variant="standard" defaultValue={user.username} onChange={(e)=>{ handleAuthChange(e) }} />
                                <TextField id="password" sx={{marginBottom: 5}} label="Password" name='password' variant="standard" type='password' defaultValue={user.password} onChange={(e)=>{ handleAuthChange(e) }} />
                
                                <Button onClick={() => {
                                    helpers.Authenticate(user).then(response => {
                                        if (response.status === 401) {
                                            navigate("/login");
                                        }
                                    
                                        response.json().then(res => {
                                            console.log('Login successful');
                                            localStorage.setItem('session-id', res.session)
                                            localStorage.setItem('session-userid', res.userid)
                                            navigate('/')
                                        });
                                    });
                                }}>
                                    Login
                                </Button>
                            </Stack>
                            </Box>
                    </Paper>
                </Box>
            </ThemeProvider>
        </Container>
    )
}