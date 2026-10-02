import RefreshIcon from '@mui/icons-material/Refresh';
import { sanitizeRichText } from '../../sanitize';
import { getImageUrl } from '../../config';
import { useState, useEffect } from 'react';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import SaveIcon from '@mui/icons-material/Save';
import PhotoCamera from '@mui/icons-material/PhotoCamera';

import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

import * as helpers from '../../Data.Helper.Api';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#90caf9',
    },
  },
});

export default function AdminAboutEditor() {
  const [content, setContent] = useState('');
  const [coverPhoto, setCoverPhoto] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [file, setFile] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchAboutSettings() {
      setLoading(true);
      setLoadError('');
      try {
        const response = await helpers.GetSettings();
        if (!response.ok) throw new Error('Failed to load settings');
        const { settings } = await response.json();
        if (!settings || typeof settings !== 'object' || Array.isArray(settings) ||
            (settings.about_content != null && typeof settings.about_content !== 'string') ||
            (settings.about_cover_photo != null && typeof settings.about_cover_photo !== 'string')) {
          throw new Error('Invalid settings response');
        }
        if (cancelled) return;
        setContent(sanitizeRichText(settings.about_content ?? ''));
        setCoverPhoto(settings.about_cover_photo ?? '');
      } catch {
        if (!cancelled) setLoadError('Failed to load settings');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchAboutSettings();
    return () => { cancelled = true; };
  }, [attempt]);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };


  const handleSave = async () => {
    if (loading || loadError) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const updates = [
        { key: 'about_content', value: sanitizeRichText(content) }
      ];

      // 1. Handle Image Upload if selected
      if (file) {
        const uploadRes = await helpers.AdminUpload(file);
        if (uploadRes.ok) {
            const uploadData = await uploadRes.json();
            const photoUrl = uploadData.imageUrl;
            updates.push({ key: 'about_cover_photo', value: photoUrl });
            setCoverPhoto(photoUrl);
        } else {
            throw new Error('Image upload failed');
        }
      }

      // 2. Perform Batch Update
      const batchRes = await helpers.UpdateSettingsBatch(updates);
      if (batchRes.ok) {
        setSuccess('About page updated successfully');
        setFile(null); // Clear file only after success
      } else {
        const errData = await batchRes.json();
        throw new Error(errData.error || 'Failed to update settings');
      }
    } catch (err) {
      console.error('Save Error:', err);
      setError(err.message || 'An unexpected error occurred during save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Container sx={{ mt: 8, textAlign: 'center' }}>
        <CircularProgress />
      </Container>
    );
  }

  if (loadError) return <Alert severity="error">{loadError}<Button startIcon={<RefreshIcon aria-hidden="true" />} onClick={() => setAttempt(value => value + 1)}>Retry</Button></Alert>;

  const quillModules = {
    toolbar: [
      [{ 'header': [1, 2, 3, false] }],
      ['bold', 'italic', 'underline', 'strike', 'blockquote'],
      [{ 'list': 'ordered' }, { 'list': 'bullet' }],
      ['link', 'clean'],
      ['code-block']
    ],
  };

  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 8 }}>
      <ThemeProvider theme={darkTheme}>
        <Paper elevation={4} sx={{ p: 4, borderRadius: 2, bgcolor: 'rgba(30,30,30,0.7)', backdropFilter: 'blur(10px)' }}>
          <Typography variant="h4" gutterBottom sx={{ fontWeight: 700 }}>Edit About Page</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
            Customize the content and appearance of your platform's About page.
          </Typography>

          {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
          {success && <Alert severity="success" sx={{ mb: 3 }}>{success}</Alert>}

          <Stack spacing={4}>
            <Box sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, border: '1px solid rgba(255,255,255,0.05)' }}>
              <Typography variant="h6" gutterBottom color="primary.main" sx={{ fontWeight: 700 }}>Cover Photo</Typography>

              {coverPhoto && (
                <Box sx={{ mb: 2, borderRadius: 2, overflow: 'hidden', height: 200, bgcolor: '#000' }}>
                    <img src={getImageUrl(coverPhoto)} alt="Cover" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </Box>
              )}

              <Stack direction="row" spacing={2} alignItems="center">
                <input
                    accept="image/*"
                    style={{ display: 'none' }}
                    id="about-cover-upload"
                    type="file"
                    onChange={handleFileChange}
                />
                <label htmlFor="about-cover-upload">
                    <Button variant="outlined" component="span" startIcon={<PhotoCamera />}>
                        {file ? file.name : 'Choose New Photo'}
                    </Button>
                </label>
                {file && <Typography variant="caption" color="text.secondary">Ready to upload</Typography>}
              </Stack>
            </Box>

            <Box sx={{ bgcolor: '#fff', color: '#000', borderRadius: 2, overflow: 'hidden' }}>
              <ReactQuill
                theme="snow"
                value={sanitizeRichText(content)}
                onChange={setContent}
                modules={quillModules}
                formats={['header', 'bold', 'italic', 'underline', 'strike', 'blockquote', 'list', 'link', 'code-block']}
                style={{ height: '400px', marginBottom: '50px' }}
              />
            </Box>

            <Box display="flex" justifyContent="flex-end" sx={{ mt: 2 }}>
              <Button
                variant="contained"
                size="large"
                startIcon={saving ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}
                onClick={handleSave}
                disabled={saving}
                sx={{ borderRadius: '12px', px: 4 }}
              >
                {saving ? 'Saving...' : 'Save About Page'}
              </Button>
            </Box>
          </Stack>
        </Paper>
      </ThemeProvider>
    </Container>
  );
}
