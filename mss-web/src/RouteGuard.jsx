import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Alert, Button, Box } from '@mui/material';
import * as api from './Data.Helper.Api';

export default function RouteGuard({ children, admin = false, createEvent = false }) {
  const [state, setState] = useState({ loading: true });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    let generation = 0;
    const check = async () => {
      const current = ++generation;
      const token = localStorage.getItem('mss-token');
      const valid = () => active && current === generation && token === localStorage.getItem('mss-token');
      if (!api.HasSession()) { if (valid()) setState({ signedOut: true }); return; }
      if (valid()) setState({ loading: true });
      try {
        const response = await api.GetCurrentUser();
        if (response.status === 401) { if (valid()) setState({ signedOut: true }); return; }
        if (!response.ok) throw new Error('Session validation failed');
        const { user } = await response.json();
        if (valid()) setState({ user });
      } catch { if (valid()) setState({ error: true }); }
    };
    check();
    window.addEventListener('mss-auth-change', check);
    return () => { active = false; window.removeEventListener('mss-auth-change', check); };
  }, [attempt]);
  if (state.signedOut) return <Navigate to="/login" replace />;
  if (state.loading) return <Box role="status">Checking session...</Box>;
  if (state.error) return <Alert severity="error">Unable to verify your session. <Button onClick={() => setAttempt(n => n + 1)}>Retry</Button></Alert>;
  if (!state.user || (admin && state.user.role !== 'admin') || (createEvent && !['artist', 'admin'].includes(state.user?.role))) return <Alert severity="error">You are not authorized to access this page.</Alert>;
  return children;
}
