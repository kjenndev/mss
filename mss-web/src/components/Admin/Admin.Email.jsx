import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Checkbox, FormControlLabel, Stack, TextField, Typography } from '@mui/material';
import * as api from '../../Data.Helper.Api';
import { LEGAL_CONTACT } from '../../content/registrationLegal';
import Layout from '../Auth/RegistrationLayout';
const textFields = ['from_email', 'from_name', 'reply_to', 'public_url'];
function validSettings(data) {
  return data && typeof data.enabled === 'boolean' && typeof data.api_key_configured === 'boolean' && textFields.every(k => data[k] === null || typeof data[k] === 'string');
}
export default function AdminEmail() {
  const [settings, setSettings] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [success, setSuccess] = useState(''),
    [busy, setBusy] = useState(false),
    [key, setKey] = useState(''),
    [clear, setClear] = useState(false);
  const mounted = useRef(false), generation = useRef(0);
  async function load() {
    const request = ++generation.current;
    const current = () => mounted.current && request === generation.current;
    setLoading(true);
    setSettings(null);
    setError('');
    try {
      const r = await api.GetEmailSettings();
      if (!r.ok) throw Error();
      const data = await r.json();
      if (!validSettings(data)) throw Error();
      if (!current()) return false;
      setSettings({
        enabled: data.enabled,
        api_key_configured: data.api_key_configured,
        from_email: data.from_email || '',
        from_name: data.from_name || '',
        reply_to: data.reply_to || LEGAL_CONTACT,
        public_url: data.public_url || ''
      });
      return true;
    } catch {
      if (current()) setError('Unable to load email settings.');
      return false;
    } finally {
      if (current()) setLoading(false);
    }
  }
  useEffect(() => {
    mounted.current = true;
    load();
    return () => { mounted.current = false; };
  }, []);
  async function submit(e) {
    e.preventDefault();
    if (!settings || busy) return;
    setError('');
    setSuccess('');
    const emailOk = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
    let urlOk = false;
    try {
      const url = new URL(settings.public_url);
      urlOk = settings.public_url === url.origin && !url.username && !url.password && (url.protocol === 'https:' || url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
    } catch {/* validation below */}
    if (settings.from_email && !emailOk(settings.from_email) || !emailOk(settings.reply_to) || !urlOk || /[\r\n]/.test(settings.from_name) || settings.enabled && (!settings.from_email || !key && (!settings.api_key_configured || clear))) {
      setError('Enter a valid sender, reply-to and exact HTTPS origin (HTTP only for loopback), without a trailing slash or path. Enabling email also requires a Resend API key.');
      return;
    }
    const payload = {
      enabled: settings.enabled,
      from_email: settings.from_email,
      from_name: settings.from_name,
      reply_to: settings.reply_to,
      public_url: settings.public_url
    };
    if (clear) payload.clear_api_key = true;else if (key) payload.api_key = key;
    setBusy(true);
    try {
      const r = await api.UpdateEmailSettings(payload);
      if (!r.ok) throw Error();
      if (!mounted.current) return;
      setKey('');
      setClear(false);
      if (await load()) setSuccess('Email settings saved.');
    } catch {
      if (mounted.current) setError('Unable to save email settings. Please retry.');
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  const change = e => setSettings({
    ...settings,
    [e.target.name]: e.target.value
  });
  return <Layout title="Email setup"><Typography>Configure Resend for account verification and optional email alerts. Verify your sending domain in Resend before enabling delivery. A saved configuration does not confirm domain readiness.</Typography>{loading ? <Typography role="status">Loading email settings…</Typography> : !settings ? <><Alert severity="error">{error}</Alert><Button onClick={load}>Retry</Button></> : <Stack component="form" onSubmit={submit} spacing={3}>
 <FormControlLabel control={<Checkbox checked={settings.enabled} onChange={e => setSettings({
        ...settings,
        enabled: e.target.checked
      })} />} label="Enable email delivery and public registration" />
 <TextField label="From email" name="from_email" type="email" required={settings.enabled} value={settings.from_email} onChange={change} helperText="Use an address on your verified sending domain. No sender has been selected for you." />
 <TextField label="From name" name="from_name" value={settings.from_name} onChange={change} />
 <TextField label="Reply-to email" name="reply_to" type="email" required value={settings.reply_to} onChange={change} />
 <TextField label="Public site URL" name="public_url" type="url" required value={settings.public_url} onChange={change} helperText="Exact HTTPS origin, for example https://example.com — no trailing slash, path, query or fragment. HTTP is allowed only for localhost, 127.0.0.1 or [::1] in local development; production requires HTTPS." />
 <Typography>{settings.api_key_configured ? 'A Resend API key is configured.' : 'No Resend API key is configured.'}</Typography>
 <TextField label="Resend API key" type="password" autoComplete="new-password" value={key} disabled={clear} onChange={e => setKey(e.target.value)} helperText="Write-only. Leave blank to keep the saved key." />
 <FormControlLabel control={<Checkbox checked={clear} onChange={e => {
        setClear(e.target.checked);
        setKey('');
      }} />} label="Clear saved API key" />
 {error && <Alert severity="error">{error}</Alert>}<Button type="submit" variant="contained" disabled={busy}>Save email settings</Button></Stack>}{success && <Alert severity="success">{success}</Alert>}</Layout>;
}
