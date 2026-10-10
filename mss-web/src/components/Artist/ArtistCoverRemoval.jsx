import { useEffect, useRef, useState } from 'react';
import { Alert, Button } from '@mui/material';
import HideImageOutlinedIcon from '@mui/icons-material/HideImageOutlined';
import * as helpers from '../../Data.Helper.Api';

export default function ArtistCoverRemoval({ id, artist, onRemoved }) {
  const [identity, setIdentity] = useState(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const generation = useRef(0);
  const busy = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    let active = true;
    const refresh = async () => {
      const version = ++generation.current;
      const token = localStorage.getItem('mss-token');
      setIdentity(null); setError(''); setSuccess(false);
      try {
        if (!token) return;
        const response = await helpers.GetCurrentUser();
        if (!response.ok) return;
        const { user } = await response.json();
        if (active && version === generation.current && token === localStorage.getItem('mss-token')) setIdentity({ user, token });
      } catch { /* Unverified sessions cannot manage the cover. */ }
    };
    refresh();
    window.addEventListener('mss-auth-change', refresh);
    window.addEventListener('storage', refresh);
    window.addEventListener('mss-role-change', refresh);
    return () => {
      active = false; mounted.current = false;
      window.removeEventListener('mss-auth-change', refresh);
      window.removeEventListener('storage', refresh);
      window.removeEventListener('mss-role-change', refresh);
    };
  }, [id]);

  const user = identity?.user;
  const allowed = identity?.token === localStorage.getItem('mss-token') && user &&
    (user.role === 'admin' || (Number(user.id) > 0 && Number(user.id) === Number(artist.user_id) && (!artist.is_disabled || user.role === 'artist')));
  async function removeCover() {
    if (!allowed || !artist.cover_photo || busy.current) return;
    busy.current = true; setPending(true); setError(''); setSuccess(false);
    const version = generation.current;
    const token = identity.token;
    const current = () => mounted.current && version === generation.current && token === localStorage.getItem('mss-token');
    try {
      const response = await helpers.UpdateArtist({ id, cover_photo: null });
      if (!response.ok) throw new Error('Unable to remove cover. Please try again.');
      const data = await response.json();
      if (Number(data.artist?.id) !== Number(id) || data.artist?.cover_photo !== null) throw new Error('Cover removal was not confirmed. Please try again.');
      if (current()) { onRemoved(); setSuccess(true); }
    } catch (cause) {
      if (current()) setError(cause.message === 'Cover removal was not confirmed. Please try again.' ? cause.message : 'Unable to remove cover. Please try again.');
    } finally {
      busy.current = false;
      if (mounted.current) setPending(false);
    }
  }

  if (!allowed) return null;
  return <>
    {artist.cover_photo && <Button variant="outlined" startIcon={<HideImageOutlinedIcon />} disabled={pending} onClick={removeCover} sx={{ position: 'absolute', top: 12, right: 12, zIndex: 1, minHeight: 44, maxWidth: 'calc(100% - 24px)', color: '#fff', backgroundColor: '#171717', borderColor: '#b7c9d6', '&:hover': { backgroundColor: '#292929', borderColor: '#fff' }, '&.Mui-disabled': { color: '#c8c8c8', backgroundColor: '#171717', borderColor: '#777' }, '&:focus-visible': { outline: '3px solid #90caf9', outlineOffset: 2 } }}>{pending ? 'Removing cover…' : 'Remove cover'}</Button>}
    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
    {success && <Alert severity="success" role="status" sx={{ mb: 2 }}>Cover removed. Gallery photos are unchanged.</Alert>}
  </>;
}
