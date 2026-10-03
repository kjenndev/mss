import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Stack, Typography } from '@mui/material';
import ProfileAvatar from './ProfileAvatar';
import * as api from '../../Data.Helper.Api';

export default function AccountAvatar({ user }) {
  const [picture, setPicture] = useState(user.profile_picture || null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const input = useRef(null);
  const active = useRef(false);
  const busy = useRef(false);
  const generation = useRef(0);
  const token = useRef(localStorage.getItem('mss-token'));
  const [authorized, setAuthorized] = useState(Boolean(token.current));
  useEffect(() => {
    active.current = true;
    const invalidate = () => {
      if (localStorage.getItem('mss-token') === token.current) return;
      generation.current++;
      busy.current = false;
      setAuthorized(false); setFile(null); setPicture(null); setSaving(false); setSuccess(''); setError('Your session changed. Reload Account Settings to continue.');
    };
    window.addEventListener('mss-auth-change', invalidate);
    window.addEventListener('storage', invalidate);
    // This is a request counter, not a DOM ref; invalidate pending work at cleanup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { active.current = false; generation.current++; window.removeEventListener('mss-auth-change', invalidate); window.removeEventListener('storage', invalidate); };
  }, []);
  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  function choose(event) {
    const selected = event.target.files?.[0];
    event.target.value = '';
    if (!selected || busy.current) return;
    setSuccess(''); setError(''); setFile(null);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(selected.type) || selected.size === 0 || selected.size > 5 * 1024 * 1024) {
      setError('Choose a JPG, PNG or WebP image up to 5 MiB.'); return;
    }
    setFile(selected);
  }
  async function save(remove = false) {
    if (busy.current || !authorized || (!remove && !file) || localStorage.getItem('mss-token') !== token.current) return;
    busy.current = true; setSaving(true); setError(''); setSuccess('');
    const request = ++generation.current;
    const current = () => active.current && request === generation.current && localStorage.getItem('mss-token') === token.current;
    try {
      const response = await (remove ? api.DeleteMyAvatar() : api.UploadMyAvatar(file));
      const data = await response.json();
      if (!current()) return;
      if (!response.ok) throw new Error(data.error || 'Unable to save your profile picture.');
      if (!data.user || data.user.id !== user.id || (remove ? data.user.profile_picture !== null : typeof data.user.profile_picture !== 'string' || !data.user.profile_picture)) throw new Error('Could not confirm the saved picture. Please retry.');
      setPicture(data.user.profile_picture); setFile(null);
      setSuccess(remove ? 'Profile picture removed.' : 'Profile picture saved.');
      window.dispatchEvent(new CustomEvent('mss-avatar-change'));
    } catch (failure) {
      if (current()) setError(failure.message || 'Unable to save your profile picture. Please retry.');
    } finally {
      if (current()) { busy.current = false; setSaving(false); }
    }
  }
  return <Box component="section" aria-labelledby="profile-picture-heading" sx={{ borderTop: '1px solid #333', borderBottom: '1px solid #333', py: 3 }}>
    <Typography component="h2" id="profile-picture-heading" variant="h6" sx={{ mb: 2 }}>Profile picture</Typography>
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} alignItems={{ xs: 'flex-start', sm: 'center' }}>
      <ProfileAvatar src={preview || picture} name={user.username} sx={{ width: 88, height: 88, bgcolor: '#263746', color: '#90caf9', fontSize: 32 }} />
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" color="text.secondary">Your picture is publicly visible, including beside your comments.</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>JPG, PNG or WebP · up to 5 MiB · single image, up to 16 megapixels.</Typography>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose profile picture" onChange={choose} hidden disabled={saving || !authorized} />
        <Stack direction="row" useFlexGap flexWrap="wrap" gap={1} sx={{ mt: 2, '& button': { minHeight: 44 } }}>
          <Button variant="outlined" onClick={() => input.current.click()} disabled={saving || !authorized}>{picture ? 'Replace picture' : 'Upload picture'}</Button>
          {file && <><Button variant="contained" onClick={() => save()} disabled={saving || !authorized}>{saving ? 'Saving picture…' : error ? 'Retry save picture' : 'Save picture'}</Button><Button onClick={() => { setFile(null); setError(''); }} disabled={saving}>Cancel selection</Button></>}
          {picture && <Button color="error" onClick={() => save(true)} disabled={saving || !authorized}>Remove picture</Button>}
        </Stack>
        {file && <Typography variant="body2" sx={{ mt: 1, overflowWrap: 'anywhere' }}>Preview: {file.name} — not saved yet.</Typography>}
        {saving && <Typography role="status" sx={{ mt: 1 }}>Saving picture…</Typography>}
      </Box>
    </Stack>
    {error && <Alert severity="error" sx={{ mt: 2 }}>{error}{!file && picture && ' Retry Remove picture or choose another image.'}</Alert>}
    {success && <Alert severity="success" role="status" sx={{ mt: 2 }}>{success}</Alert>}
  </Box>;
}
