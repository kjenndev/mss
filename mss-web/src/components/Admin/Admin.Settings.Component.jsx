import RefreshIcon from '@mui/icons-material/Refresh';
import { useState, useEffect, useRef } from 'react';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import TextField from '@mui/material/TextField';
import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import SaveIcon from '@mui/icons-material/Save';

import styles from './Admin.Settings.Component.module.css';

import * as helpers from '../../Data.Helper.Api';
import { safeSocialUrl, SOCIAL_PLATFORMS } from '../../socialLinks';

const SOCIAL_KEYS = new Set(SOCIAL_PLATFORMS.map(({ key }) => key));
const emptySocial = () => Object.fromEntries(SOCIAL_PLATFORMS.map(({ key }) => [key, '']));

function settingsValues(data) {
  const values = Object.fromEntries(data.raw.map(({ key, value }) => [key, value ?? '']));
  if (data.settings !== undefined) {
    if (!data.settings || typeof data.settings !== 'object' || Array.isArray(data.settings)) throw new Error('Invalid settings');
    for (const [key, value] of Object.entries(data.settings)) {
      if (value !== null && typeof value !== 'string') throw new Error(`Invalid setting ${key}`);
      values[key] = value ?? '';
    }
  }
  return values;
}

const darkTheme = createTheme({
  shape: { borderRadius: 4 },
  components: { MuiButton: { styleOverrides: { root: { minHeight: 44, textTransform: 'none' } } } },
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
  const [socialDraft, setSocialDraft] = useState(emptySocial);
  const [ready, setReady] = useState(false);
  const [socialErrors, setSocialErrors] = useState({});
  const socialSaving = useRef(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    setLoading(true);
    setError('');
    setSuccess('');
    setSettings([]);
    setReady(false);
    try {
      const response = await helpers.GetSettings();
      if (!response.ok) throw new Error('Settings request failed');
      const data = await response.json();
      if (!Array.isArray(data.raw) || !data.raw.every(setting =>
        setting && typeof setting.key === 'string' && setting.key.trim() &&
        (setting.value === null || typeof setting.value === 'string') &&
        (setting.description == null || typeof setting.description === 'string')
      )) throw new Error('Invalid settings');
      setSettings(data.raw.map(setting => ({ ...setting, value: setting.value ?? '' })));
      setSocialDraft({ ...emptySocial(), ...Object.fromEntries(Object.entries(settingsValues(data)).filter(([key]) => SOCIAL_KEYS.has(key))) });
      setReady(true);
    } catch {
      setError('Failed to load settings');
    } finally {
      setLoading(false);
    }
  }

  const handleValueChange = (key, value) => {
    setSettings(prev => prev.map(s => s.key === key ? { ...s, value } : s));
  };

  const handleSocialSave = async () => {
    if (loading || saving !== null || socialSaving.current) return;
    const invalid = {}, draft = {};
    for (const { key, label } of SOCIAL_PLATFORMS) {
      const value = socialDraft[key];
      const normalized = safeSocialUrl(value);
      if (value.trim() && !normalized) invalid[key] = `${label} must be a complete HTTP(S) URL without credentials or whitespace.`;
      draft[key] = normalized ?? '';
    }
    setSocialErrors(invalid);
    if (Object.keys(invalid).length) {
      setError('Fix the highlighted social links before saving.');
      setSuccess('');
      return;
    }
    socialSaving.current = true;
    setSaving('social');
    setError('');
    setSuccess('');
    try {
      const response = await helpers.UpdateSettingsBatch(SOCIAL_PLATFORMS.map(({ key }) => ({ key, value: draft[key] })));
      if (!response.ok) throw new Error('save');
      const readResponse = await helpers.GetSettings();
      if (!readResponse.ok) throw new Error('readback');
      const data = await readResponse.json();
      if (!Array.isArray(data.raw)) throw new Error('readback');
      const values = settingsValues(data);
      if (SOCIAL_PLATFORMS.some(({ key }) => values[key] !== draft[key])) throw new Error('readback');
      setSocialDraft(draft);
      setSuccess('Social links updated successfully');
    } catch (err) {
      setError(err.message === 'readback' ? 'Unable to verify saved social links' : 'Failed to update social links');
    } finally {
      socialSaving.current = false;
      setSaving(null);
    }
  };

  const handleSave = async (key, value) => {
    if (loading || saving !== null || !settings.some(setting => setting.key === key)) return;
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
    <Container maxWidth="md" className={styles.container}>
      <ThemeProvider theme={darkTheme}>
        <Box>
          <p className={styles.eyebrow}>Site Settings</p>
          <Typography component="h1" className={styles.title} gutterBottom>System Settings<span aria-hidden="true">.</span></Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
            Manage global configuration for the Midnight Sound Syndicate platform.
          </Typography>

          <Button href="/admin/homepage" variant="outlined" sx={{ mb: 3, mr: 2 }}>Homepage featured videos</Button>
          <Button href="/admin/email" variant="outlined" sx={{ mb: 3 }}>Email setup</Button>
          {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
          {error === 'Failed to load settings' && <Button startIcon={<RefreshIcon aria-hidden="true" />} onClick={fetchSettings}>Retry</Button>}
          {success && <Alert severity="success" sx={{ mb: 3 }}>{success}</Alert>}

          <Stack spacing={4}>
            {ready && <Box component="section" aria-labelledby="social-links-title" className={styles.section}>
              <Box className={styles.settingHeader}>
                <Box>
                  <Typography component="h2" id="social-links-title" variant="h6" sx={{ fontWeight: 700, color: 'primary.main' }}>Social links</Typography>
                  <Typography variant="body2" color="text.secondary">Optional absolute HTTP(S) profile URLs shown on the About page. Blank links stay hidden.</Typography>
                </Box>
                <Button variant="contained" startIcon={saving === 'social' ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />} onClick={handleSocialSave} disabled={saving !== null}>Save social links</Button>
              </Box>
              <Stack spacing={2}>
                {SOCIAL_PLATFORMS.map(({ key, label }) => <TextField key={key} label={label} type="url" fullWidth size="small" disabled={saving === 'social'} error={!!socialErrors[key]} helperText={socialErrors[key]} value={socialDraft[key]} onChange={event => { setSocialDraft(current => ({ ...current, [key]: event.target.value })); setSocialErrors(current => ({ ...current, [key]: '' })); }} placeholder={`https://…/${label.toLowerCase().replaceAll(' ', '-')}`} />)}
              </Stack>
            </Box>}
            {settings.filter(setting => !SOCIAL_KEYS.has(setting.key)).map((setting) => (
              <Box component="section" aria-labelledby={`setting-title-${setting.key}`} key={setting.key} className={styles.section}>
                <Box className={styles.settingHeader}>
                  <Box>
                    <Typography component="h2" id={`setting-title-${setting.key}`} variant="subtitle1" sx={{ fontWeight: 700, color: 'primary.main' }}>
                      {setting.key.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                    </Typography>
                    <Typography id={`setting-description-${setting.key}`} variant="body2" color="text.secondary">
                      {setting.description}
                    </Typography>
                  </Box>
                  <Button
                    variant="contained"
                    size="small"
                    startIcon={saving === setting.key ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
                    onClick={() => handleSave(setting.key, setting.value)}
                    disabled={saving !== null}

                  >
                    Save
                  </Button>
                </Box>
                <TextField
                  slotProps={{ htmlInput: { 'aria-labelledby': `setting-title-${setting.key}`, 'aria-describedby': `setting-description-${setting.key}` } }}
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
        </Box>
      </ThemeProvider>
    </Container>
  );
}
