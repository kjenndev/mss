import { useEffect } from 'react';
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
    const adminOnlyRoutes = ['/users/create', '/artists/create', '/admin/dashboard'];
    const isAdmin = helpers.IsAdmin();
    const hasSession = helpers.HasSession();

    if (adminOnlyRoutes.includes(location.pathname) && !isAdmin) {
      if (!hasSession) {
        navigate('/login');
        return;
      }
      navigate('/');
    }
  }, [location, navigate]);

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
