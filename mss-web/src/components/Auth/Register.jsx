import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Stack, TextField, Typography } from '@mui/material';
import * as api from '../../Data.Helper.Api';
import { TERMS_VERSION, PRIVACY_VERSION } from '../../content/registrationLegal';
import Layout from './RegistrationLayout';
export const ALERTS_LABEL = 'Receive email alerts about live streaming and upcoming events';
export default function Register() {
  const [config, setConfig] = useState(null),
    [attempt, setAttempt] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [done, setDone] = useState(false);
  const [fields, setFields] = useState({
    username: '',
    email: ''
  });
  useEffect(() => {
    let active = true;
    setConfig(null);
    api.GetRegistrationConfig().then(async r => {
      if (!r.ok) throw Error();
      const c = await r.json();
      if (active) setConfig(c || {
        enabled: false
      });
    }).catch(() => {
      if (active) setConfig({
        enabled: false
      });
    });
    return () => {
      active = false;
    };
  }, [attempt]);
  const available = config?.enabled === true && config.terms_version === TERMS_VERSION && config.privacy_version === PRIVACY_VERSION;
  const change = e => setFields({
    ...fields,
    [e.target.name]: e.target.type === 'checkbox' ? e.target.checked : e.target.value
  });
  async function submit(e) {
    e.preventDefault();
    if (busy || !available) return;
    if (!fields.username.trim() || !fields.email) {
      setError('Enter a username and email address.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const r = await api.Register({ username: fields.username, email: fields.email });
      if (!r.ok) throw Error();
      setDone(true);
    } catch {
      setError('Unable to register right now. Check your details or try again later.');
    } finally {
      setBusy(false);
    }
  }
  return <Layout title="Create account">{done ? <Alert severity="info">Check your email. If registration can proceed, a verification link will arrive. Open the email link to choose your password and agreements and finish your account securely. You will not be signed in automatically.</Alert> : !config ? <Typography role="status">Checking registration availability…</Typography> : !available ? <Alert severity="info">Registration is currently unavailable. Email delivery may not be configured yet. <Button onClick={() => setAttempt(n => n + 1)}>Retry</Button></Alert> : <Stack component="form" spacing={3} onSubmit={submit}>
 <Typography>Start with your username and email. We will email you a link to finish securely, choose your password and review the required agreements.</Typography>
 <TextField required label="Username" helperText="Usernames are not case-sensitive" name="username" autoComplete="username" value={fields.username} onChange={change} />
 <TextField required label="Email address" name="email" type="email" autoComplete="email" value={fields.email} onChange={change} />
 {error && <Alert severity="error">{error}</Alert>}<Button variant="contained" type="submit" disabled={busy}>{busy ? 'Submitting…' : 'Create account'}</Button></Stack>}
 <Link to="/login">Already have an account? Login</Link><Link to="/resend-verification">Resend verification email</Link></Layout>;
}
