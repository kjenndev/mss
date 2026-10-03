import { useState } from 'react';
import { Alert, Button, Stack, TextField, Typography } from '@mui/material';
import * as api from '../../Data.Helper.Api';
export default function AccountEmail({
  email,
  verified
}) {
  const [nextEmail, setNextEmail] = useState(''),
    [password, setPassword] = useState(''),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false),
    [error, setError] = useState('');
  async function submit(e) {
    e.preventDefault();
    if (busy || !nextEmail || !password) return;
    setBusy(true);
    setError('');
    setDone(false);
    try {
      const r = await api.ChangeEmail({
        email: nextEmail,
        current_password: password
      });
      if (!r.ok) throw Error();
      setPassword('');
      setDone(true);
    } catch {
      setError('Unable to request an email change. Check your details or try again later.');
    } finally {
      setBusy(false);
    }
  }
  return <Stack component="form" onSubmit={submit} spacing={2} sx={{
    borderTop: '1px solid',
    borderColor: 'divider',
    pt: 3
  }}><Typography component="h2" variant="h6">Email address</Typography><Typography>{email || 'No email address added'}</Typography><Typography color="text.secondary">{verified ? 'Verified email' : 'Add and verify an email to receive optional alerts. Your existing login still works.'}</Typography><Typography variant="body2">Your current email stays unchanged until the new address is verified.</Typography><TextField label="New email address" type="email" required autoComplete="email" value={nextEmail} onChange={e => setNextEmail(e.target.value)} /><TextField label="Current password" type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} />{error && <Alert severity="error">{error}</Alert>}{done && <Alert severity="info">Check your email. If the change can proceed, a verification link will arrive at the new address.</Alert>}<Button type="submit" variant="outlined" disabled={busy}>Send verification link</Button></Stack>;
}
