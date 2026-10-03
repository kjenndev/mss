import { Container, Typography, Stack, ThemeProvider, createTheme } from '@mui/material';
const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#90caf9'
    }
  },
  shape: {
    borderRadius: 4
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          minHeight: 44,
          textTransform: 'none'
        }
      }
    }
  }
});
export default function RegistrationLayout({
  title,
  children
}) {
  return <ThemeProvider theme={theme}><Container maxWidth="sm" sx={{
      py: {
        xs: 4,
        md: 7
      },
      '& a': {
        color: 'primary.main',
        textUnderlineOffset: '3px'
      },
      '& a:focus-visible': {
        outline: '2px solid',
        outlineColor: 'primary.main',
        outlineOffset: 4
      }
    }}><Typography sx={{
        textTransform: 'uppercase',
        letterSpacing: 2,
        fontSize: 12,
        color: 'text.secondary'
      }}>Account access</Typography><Typography component="h1" sx={{
        fontSize: {
          xs: 36,
          md: 48
        },
        fontWeight: 750,
        mb: 4
      }}>{title}<span aria-hidden="true" style={{
          color: '#90caf9'
        }}>.</span></Typography><Stack spacing={3}>{children}</Stack></Container></ThemeProvider>;
}
