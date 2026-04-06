import useSWRMutation from 'swr/mutation'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom';

import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import TextField from '@mui/material/TextField';
import Stack from '@mui/material/Stack';


const darkTheme = createTheme({
  palette: {
    mode: 'dark',
  },
});

// Manually handle the API call
async function _CreateUserHandler(url, user) {
    await fetch(url, {
        method: 'POST',
        body: JSON.stringify(user)
    });
}

// Component Declaration
export default function CreateUser() {
    // Setup a state object for User
    const [user, setUser] = useState({username: '', password: ''});
    const navigate = useNavigate();

    // Handle when a textbox value changes
    function handleUserChange(e) {
        user[e.target.name] = e.target.value;
        setUser(user);
    }

    // Setup the trigger event
    const { trigger } = useSWRMutation('http://127.0.0.1:5000/users', _CreateUserHandler, {});

    return (
        <Container>
            <ThemeProvider theme={darkTheme}>
                <Box component="form" noValidate autoComplete="off">
                    <Paper elevation={3} sx={{p: 5}}>
                        <Box sx={{width: 600}}>
                            <Stack>
                                <Typography sx={{marginBottom: 5}} variant='h4'>Create New User</Typography>
                                <TextField id="username" sx={{marginBottom: 5}} label="Username" name='username' variant="standard" defaultValue={user.username} onChange={(e)=>{ handleUserChange(e) }} />
                                <TextField id="password" sx={{marginBottom: 5}} label="Password" name='password' variant="standard" type='password' defaultValue={user.password} onChange={(e)=>{ handleUserChange(e) }} />
                
                                <Button onClick={() => {
                                    // Call trigger event passing in thje new artist
                                    trigger(user);
                                    navigate('/artists');

                                    }}>
                                        Create User
                                </Button>
                            </Stack>
                            </Box>
                    </Paper>
                </Box>
            </ThemeProvider>
        </Container>
    );
}