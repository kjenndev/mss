import './App.css'
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';

import NavWrapper from './components/Nav.Component.Wrapper';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
  },
});

// 3. Render the Provider
export default function App() {
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
