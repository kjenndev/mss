import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
  },
});

export default function Home() {
    return (
        <>
            <Container>
                <ThemeProvider theme={darkTheme}>
                    <Box component="form" noValidate autoComplete="off">
                        <Paper elevation={3} sx={{p: 5}}>
                            <Typography variant="h4" gutterBottom>
                                Welcome to Midnight Sound Syndicate
                            </Typography>
                        </Paper>
                    </Box>
                </ThemeProvider>
            </Container>
        </>
    );
}