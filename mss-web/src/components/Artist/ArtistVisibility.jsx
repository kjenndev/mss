import { useEffect, useId, useRef, useState } from 'react';
import { Alert, Box, FormControlLabel, Switch, Typography } from '@mui/material';
import { GetCurrentUser, GetArtistById, SetArtistVisibility } from '../../Data.Helper.Api';

export default function ArtistVisibility({ artist, onChange, busy = false }) {
  const [admin, setAdmin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const active = useRef(false);
  const pending = useRef(false);
  const statusId = useId();
  useEffect(() => {
    active.current = true;
    let cancelled = false;
    const token = localStorage.getItem('mss-token');
    (async () => {
      try {
        const response = await GetCurrentUser();
        const data = response?.ok ? await response.json() : null;
        if (!cancelled && token === localStorage.getItem('mss-token')) setAdmin(data?.user?.role === 'admin');
      } catch { /* No verified role means no administrative action. */ }
    })();
    return () => { cancelled = true; active.current = false; };
  }, []);
  async function toggle(_event, checked) {
    if (pending.current || busy) return;
    pending.current = true;
    setSaving(true); setError('');
    const desired = !checked;
    try {
      const response = await SetArtistVisibility(String(artist.id), desired);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Unable to change visibility. Try again.');
      }
      const read = await GetArtistById(artist.id);
      const data = read.ok ? await read.json() : null;
      if (data?.artist?.is_disabled !== desired) throw new Error('Could not confirm visibility. Try again.');
      if (active.current) onChange(desired);
    } catch (cause) { if (active.current) setError(cause.message || 'Unable to change visibility. Try again.'); }
    finally { pending.current = false; if (active.current) setSaving(false); }
  }
  if (!admin) return artist.is_disabled ? <Typography role="status">Disabled — visible only to artists and admins.</Typography> : null;
  return <Box component="section" aria-label="Profile visibility">
    <Typography component="h2" variant="h6">Profile visibility</Typography>
    <Typography id={statusId} role="status" variant="body2" sx={{ my: 1 }}>{artist.is_disabled ? 'Disabled — visible only to artists and admins.' : 'Public — visible to everyone.'}</Typography>
    <FormControlLabel
      label="Profile enabled"
      sx={{ minHeight: 44, mx: 0 }}
      control={<Switch checked={!artist.is_disabled} disabled={saving || busy} onChange={toggle} slotProps={{ input: { role: 'switch', 'aria-describedby': statusId } }} />}
    />
    {saving && <Typography role="status" variant="body2">Saving visibility…</Typography>}
    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Changes immediately. Profile details and media are kept. Known public media links are not revoked.</Typography>
    {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
  </Box>;
}
