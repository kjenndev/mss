import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Stack, TextField } from '@mui/material';
import * as api from '../../Data.Helper.Api';
import Layout from './RegistrationLayout';
export default function ResendVerification() {
  const [email, setEmail] = useState(''),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false),
    [error, setError] = useState('');
  async function submit(e) {
    e.preventDefault();
    if (busy || !email) return;
    setBusy(true);
    setError('');
    try {
      const r = await api.ResendVerification({
        email
      });
      if (!r.ok) throw Error();
      setDone(true);
    } catch {
      setError('Unable to request verification right now. Please try again later.');
    } finally {
      setBusy(false);
    }
  }
  return <Layout title="Resend verification">{done ? <Alert severity="info">If this address is eligible, a verification email will arrive. Check your inbox and spam folder.</Alert> : <Stack component="form" onSubmit={submit} spacing={3}><TextField required label="Email address" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} />{error && <Alert severity="error">{error}</Alert>}<Button type="submit" variant="contained" disabled={busy}>Resend verification email</Button></Stack>}<Link to="/login">Login</Link></Layout>;
}
