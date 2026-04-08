import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import './App.css'
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';

import NavWrapper from './components/Nav.Component.Wrapper';
import * as helpers from './Data.Helper.Api'

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
  },
});

// 3. Render the Provider
export default function App() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.log('Route changed to:', location.pathname);
    // Perform your interception logic here (e.g., analytics)
    const protectedRoutes = ['/users/create', '/artists/create'];

    if (protectedRoutes.includes(location.pathname)) {
      console.log('Accessing protected route:', location.pathname);

      // Check if user is authenticated
      const hasSession = helpers.HasSession();
      
      if (!hasSession) {
        console.log('User is not authenticated');
        navigate('/login');
      }
    }

  }, [location]);

  return (
    <>
      <ThemeProvider theme={darkTheme}>
        <CssBaseline />
        <NavWrapper />
        <br /><br />
      </ThemeProvider>
    </>
  )
}
