import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Checkbox, FormControlLabel, Stack, TextField, Typography } from '@mui/material';
import * as api from '../../Data.Helper.Api';
import { TERMS_VERSION, PRIVACY_VERSION } from '../../content/registrationLegal';
import { ALERTS_LABEL } from './Register';
import { takeVerificationToken } from './verificationToken';
import Layout from './RegistrationLayout';
const expired = 'This verification link could not be used. It may be invalid or expired. Use the recovery options below.';
const signIn = 'Sign in to the account requesting this change in a separate tab, then retry here. Keep this tab open to preserve the verification link.';
export default function VerifyEmail() {
  const token = useRef(undefined);
  if (token.current === undefined) token.current = takeVerificationToken();
  const mounted = useRef(false), submitting = useRef(false);
  const [info, setInfo] = useState(null), [loading, setLoading] = useState(Boolean(token.current));
  const [busy, setBusy] = useState(false), [done, setDone] = useState(false), [error, setError] = useState('');
  const [show, setShow] = useState(false);
  const [fields, setFields] = useState({ username: '', password: '', current_password: '', accept_terms: false, confirm_adult: false, email_alerts_opt_in: false });
  useEffect(() => {
    mounted.current = true;
    let active = true;
    if (token.current) {
      api.GetVerificationInfo({ token: token.current }).then(async r => {
        if (!r.ok) throw Error();
        const data = await r.json();
        if (data?.purpose !== 'email_change' && !(data?.purpose === 'registration' && typeof data.username === 'string')) throw Error();
        if (!active) return;
        setInfo(data);
        if (data.purpose === 'registration') setFields(f => ({ ...f, username: data.username }));
      }).catch(() => { if (active) setError(expired); })
        .finally(() => { if (active) setLoading(false); });
    }
    return () => { active = false; mounted.current = false; };
  }, []);
  const change = e => setFields(f => ({ ...f, [e.target.name]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  async function verify(e) {
    e.preventDefault();
    if (!token.current || submitting.current || !info) return;
    const emailChange = info.purpose === 'email_change';
    if (emailChange && !api.HasSession()) { setError(signIn); return; }
    if (emailChange ? !fields.current_password : !fields.username.trim() || fields.password.length < 5 || fields.password.length > 1024 || !fields.accept_terms || !fields.confirm_adult) {
      setError(emailChange ? 'Enter your current password.' : 'Complete all required fields and acknowledgements. Password must be between 5 and 1024 characters.');
      return;
    }
    submitting.current = true;
    setBusy(true); setError('');
    try {
      const payload = emailChange ? { token: token.current, current_password: fields.current_password } : {
        token: token.current, username: fields.username, password: fields.password,
        accept_terms: true, confirm_adult: true, terms_version: TERMS_VERSION,
        privacy_version: PRIVACY_VERSION, email_alerts_opt_in: fields.email_alerts_opt_in
      };
      const r = emailChange ? await api.VerifyEmail(payload, true) : await api.VerifyEmail(payload);
      if (!mounted.current) return;
      if (emailChange && r.status === 401) { setError(signIn); return; }
      if (!r.ok || (await r.json()).success !== true) throw Error();
      if (!mounted.current) return;
      token.current = '';
      setFields(f => ({ ...f, password: '', current_password: '' }));
      setDone(true);
    } catch { if (mounted.current) setError(expired); }
    finally { submitting.current = false; if (mounted.current) setBusy(false); }
  }
  return <Layout title="Verify email">
    {done ? <Alert severity="success">Email verified. You can now log in.</Alert> : !token.current ? <Alert severity="info">No verification token found. Open the full link from your email or request a new one.</Alert> : loading ? <Typography role="status">Checking verification link…</Typography> : info && <Stack component="form" spacing={3} onSubmit={verify}>
      {info.purpose === 'registration' ? <>
        <Typography>Finish your account securely. Choose your own username and password and review the agreements below. Nothing is verified until you submit this form. You will not be signed in automatically.</Typography>
        <TextField required label="Username" name="username" autoComplete="username" value={fields.username} onChange={change} />
        <TextField required label="Password" name="password" type={show ? 'text' : 'password'} autoComplete="new-password" value={fields.password} onChange={change} slotProps={{ htmlInput: { minLength: 5, maxLength: 1024 } }} helperText="Use 5–1024 characters. Pasting and password managers are welcome." />
        <Button onClick={() => setShow(!show)} aria-pressed={show}>{show ? 'Hide password' : 'Show password'}</Button>
        <FormControlLabel control={<Checkbox required name="confirm_adult" checked={fields.confirm_adult} onChange={change} />} label="I confirm I am 18 years of age or older" />
        <FormControlLabel control={<Checkbox required name="accept_terms" checked={fields.accept_terms} onChange={change} />} label={<span>I agree to the <Link to="/terms" target="_blank" rel="noopener noreferrer">Terms of Service</Link> and acknowledge the <Link to="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</Link>.</span>} />
        <Typography variant="body2" color="text.secondary">Terms version {TERMS_VERSION} · Privacy version {PRIVACY_VERSION}</Typography>
        <FormControlLabel control={<Checkbox name="email_alerts_opt_in" checked={fields.email_alerts_opt_in} onChange={change} />} label={ALERTS_LABEL} />
      </> : <>
        <Typography>Confirm email change while signed in to the account that requested it. Enter that account’s current password. If needed, sign in in a separate tab and retry here without closing this tab.</Typography>
        <TextField required label="Current password" name="current_password" type="password" autoComplete="current-password" value={fields.current_password} onChange={change} />
      </>}
      <Button variant="contained" type="submit" disabled={busy}>{info.purpose === 'registration' ? 'Complete registration' : 'Confirm email change'}</Button>
    </Stack>}
    {error && <Alert severity="error">{error}</Alert>}
    {!done && <><Typography>For a signup link, use resend below. For a new email-change link, sign in and request the change again in Account Settings.</Typography><Link to="/resend-verification">Resend verification email</Link><Link to="/account">Account Settings</Link></>}
    <Link to="/login" target="_blank" rel="noopener noreferrer">Sign in in a separate tab</Link>
  </Layout>;
}
