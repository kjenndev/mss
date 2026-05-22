import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import EditIcon from '@mui/icons-material/Edit';

import * as helpers from '../Data.Helper.Api';
import styles from './Home.Component.module.css'; // Reuse container and header styles

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
  },
});

export default function About() {
  const navigate = useNavigate();
  const [content, setContent] = useState('');
  const [coverPhoto, setCoverPhoto] = useState('');
  const [loading, setLoading] = useState(true);
  const [apiUrl, setApiUrl] = useState('http://localhost:4000');
  const isAdmin = helpers.IsAdmin();

  const getImageUrl = (path) => {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    const separator = path.includes('?') ? '&' : '?';
    return `${apiUrl}${path}${separator}t=${new Date().getTime()}`;
  };

  useEffect(() => {
    helpers.GetSettings().then(async (res) => {
        if (res.ok) {
            const data = await res.json();
            setContent(data.settings?.about_content || '');
            setCoverPhoto(data.settings?.about_cover_photo || '');
            if (data.settings?.api_base_url) {
                setApiUrl(data.settings.api_base_url);
            }
        }
        setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <Container sx={{ mt: 8, textAlign: 'center' }}>
        <CircularProgress />
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 8 }}>
      <ThemeProvider theme={darkTheme}>
        {coverPhoto && (
            <Box 
                sx={{ 
                    width: '100%', 
                    height: { xs: '200px', md: '400px' }, 
                    borderRadius: '16px', 
                    overflow: 'hidden', 
                    mb: 4,
                    backgroundImage: `url(${getImageUrl(coverPhoto)})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                    border: '1px solid rgba(255,255,255,0.1)'
                }}
            />
        )}
        
        <Paper 
            elevation={3} 
            sx={{ 
                p: { xs: 3, md: 6 }, 
                borderRadius: '16px', 
                bgcolor: 'rgba(30,30,30,0.7)', 
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255,255,255,0.1)'
            }}
        >
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={4}>
            <Typography variant="h3" sx={{ fontWeight: 800 }}>
                About MSS
            </Typography>
            {isAdmin && (
                <Button 
                    variant="outlined" 
                    startIcon={<EditIcon />}
                    onClick={() => navigate('/admin/about')}
                    sx={{ borderRadius: '20px', textTransform: 'none' }}
                >
                    Edit Page
                </Button>
            )}
          </Box>
          
          <Box 
            className="about-content"
            sx={{ 
                color: 'text.primary',
                lineHeight: 1.8,
                fontSize: '1.1rem',
                '& h1, & h2, & h3': { color: 'primary.main', mt: 4, mb: 2 },
                '& p': { mb: 2 },
                '& ul, & ol': { mb: 2, pl: 4 },
                '& img': { maxWidth: '100%', borderRadius: '8px', my: 2 }
            }}
            dangerouslySetInnerHTML={{ __html: content }}
          />
        </Paper>
      </ThemeProvider>
    </Container>
  );
}
