import { useState, useEffect } from 'react';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import TextField from '@mui/material/TextField';
import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import SaveIcon from '@mui/icons-material/Save';

import * as helpers from '../../Data.Helper.Api';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#90caf9',
    },
  },
});

export default function AdminSettings() {
  const [settings, setSettings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null); // stores the key being saved
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    try {
      const response = await helpers.GetSettings();
      if (response.ok) {
        const data = await response.json();
        setSettings(data.raw || []);
      }
    } catch (err) {
      console.error(err);
      setError('Failed to load settings');
    } finally {
      setLoading(false);
    }
  }

  const handleValueChange = (key, value) => {
    setSettings(prev => prev.map(s => s.key === key ? { ...s, value } : s));
  };

  const handleSave = async (key, value) => {
    setSaving(key);
    setError('');
    setSuccess('');
    try {
      const response = await helpers.UpdateSetting(key, value);
      if (response.ok) {
        setSuccess(`Setting '${key}' updated successfully`);
      } else {
        setError(`Failed to update '${key}'`);
      }
    } catch (err) {
      console.error(err);
      setError('An error occurred during save');
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <Container sx={{ mt: 8, textAlign: 'center' }}>
        <CircularProgress />
      </Container>
    );
  }

  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 8 }}>
      <ThemeProvider theme={darkTheme}>
        <Paper elevation={4} sx={{ p: 4, borderRadius: 2, bgcolor: 'rgba(30,30,30,0.7)', backdropFilter: 'blur(10px)' }}>
          <Typography variant="h4" gutterBottom sx={{ fontWeight: 700 }}>System Settings</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
            Manage global configuration for the Midnight Sound Syndicate platform.
          </Typography>

          {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
          {success && <Alert severity="success" sx={{ mb: 3 }}>{success}</Alert>}

          <Stack spacing={4}>
            {settings.map((setting) => (
              <Box key={setting.key} sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, border: '1px solid rgba(255,255,255,0.05)' }}>
                <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2}>
                  <Box>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'primary.main' }}>
                      {setting.key.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {setting.description}
                    </Typography>
                  </Box>
                  <Button 
                    variant="contained" 
                    size="small" 
                    startIcon={saving === setting.key ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
                    onClick={() => handleSave(setting.key, setting.value)}
                    disabled={saving !== null}
                    sx={{ borderRadius: '8px', textTransform: 'none' }}
                  >
                    Save
                  </Button>
                </Box>
                <TextField
                  fullWidth
                  variant="outlined"
                  value={setting.value || ''}
                  onChange={(e) => handleValueChange(setting.key, e.target.value)}
                  placeholder={`Enter ${setting.key.replace(/_/g, ' ')}`}
                  size="small"
                />
              </Box>
            ))}
          </Stack>
        </Paper>
      </ThemeProvider>
    </Container>
  );
}
