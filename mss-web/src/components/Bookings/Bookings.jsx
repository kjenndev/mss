import { useEffect, useRef, useState } from 'react';
import * as api from '../../Data.Helper.Api';
import styles from './Bookings.module.css';

const fields = [
  ['venue_name', 'Venue name', 160, true], ['contact_name', 'Contact name', 100, true],
  ['phone', 'Phone', 40, true, 'tel'], ['email', 'Email', 254, true, 'email'],
  ['event_date', 'Event date', undefined, false, 'date'], ['location', 'Event location', 240],
  ['message', 'Tell us about your event', 5000, true],
];
const empty = () => ({ ...Object.fromEntries(fields.map(([key]) => [key, ''])), services: [], website: '' });
export default function Bookings() {
  const [draft, setDraft] = useState(empty), [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [receipt, setReceipt] = useState(null);
  const pending = useRef(false), submission = useRef(null), mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const change = e => setDraft({ ...draft, [e.target.name]: e.target.value });
  async function submit(e) {
    e.preventDefault();
    if (pending.current) return;
    const next = {};
    for (const [key, label, max, required] of fields) {
      if (required && !draft[key].trim()) next[key] = `${label} is required.`;
      else if (max && draft[key].length > max) next[key] = `Use at most ${max} characters.`;
    }
    if (draft.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())) next.email = 'Enter a valid email address.';
    setErrors(next);
    if (Object.keys(next).length) { document.getElementById(Object.keys(next)[0])?.focus(); return; }
    pending.current = true; setBusy(true); setError('');
    submission.current ||= crypto.randomUUID();
    try {
      const response = await api.SubmitBooking({ ...draft, submission_id: submission.current });
      const data = await response.json();
      if (!response.ok) throw Object.assign(Error(), { userMessage: typeof data.error === 'string' ? data.error : 'Unable to send your request. Please retry.' });
      if (!data.reference) throw Object.assign(Error(), { userMessage: 'Unable to confirm receipt. Please retry.' });
      if (mounted.current) { setReceipt(data); setDraft(empty()); submission.current = null; }
    } catch (err) { if (mounted.current) setError(err.userMessage || 'Unable to send your request. Please retry.'); }
    finally { pending.current = false; if (mounted.current) setBusy(false); }
  }
  return <main className={styles.page}>
    <header className={styles.hero}><p>SYNDICATE / BOOKINGS</p><h1>Bring the night to life.</h1><p>Sound. Light. Connection. Build your next event with Midnight Sound Syndicate.</p><a className={styles.cta} href="#booking-request">Start a conversation</a></header>
    <section className={styles.benefits} aria-label="What we bring">
      <article><span aria-hidden="true">01 / SOUND</span><h2>Talent behind the decks</h2><p>Our growing roster of talented DJs brings the music and energy. Tell us the atmosphere you have in mind.</p></article>
      <article><span aria-hidden="true">02 / LIGHT</span><h2>Laser art that transforms the room</h2><p>We partner with JDS Lasers to bring amazing laser art to our shows — a visual dimension to the music.</p></article>
      <article><span aria-hidden="true">03 / CONNECTION</span><h2>Beyond the dance floor</h2><p>We stream events live on our own and other platforms, connecting the room with audiences beyond it.</p></article>
    </section>
    <section id="booking-request"><h2>Let’s make a night of it.</h2><p>Share your venue, your vision and the details you know. Required fields are marked *.</p>
      {receipt ? <div role="status"><h3>Your booking request has been received.</h3><p>Reference: {receipt.reference}</p><button onClick={() => setReceipt(null)}>Start another request</button></div> : <form noValidate onSubmit={submit} aria-busy={busy}>
        <fieldset disabled={busy}>
        <div className={styles.fields}>{fields.map(([key, label, max, required, type]) => <div key={key}>
          <label htmlFor={key}>{label}{required ? ' *' : ' (optional)'}</label>
          {key === 'message' ? <textarea id={key} name={key} required={required} maxLength={max} value={draft[key]} onChange={change} aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `${key}-error` : undefined} /> : <input id={key} name={key} type={type || 'text'} required={required} maxLength={max} value={draft[key]} onChange={change} aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `${key}-error` : undefined} />}
          {errors[key] && <p id={`${key}-error`}>{errors[key]}</p>}
        </div>)}</div>
        <fieldset className={styles.services}><legend>Interested in (optional)</legend>{[['djs', 'DJs'], ['lasers', 'Laser art'], ['streaming', 'Live streaming']].map(([key, label]) => <label key={key}><input type="checkbox" checked={draft.services.includes(key)} onChange={e => setDraft({ ...draft, services: e.target.checked ? [...draft.services, key] : draft.services.filter(s => s !== key) })} />{label}</label>)}</fieldset>
        <input type="text" name="website" value={draft.website} onChange={change} hidden tabIndex={-1} autoComplete="off" aria-hidden="true" />
        <p>This is a request, not a confirmed booking. Availability and details will be discussed with you.</p><p>Your contact details are used to respond to your request and are not public.</p>
        {error && <><p role="alert">{error}</p><p>Retry with the same details to avoid duplicates. After a timeout or uncertain response, your request may already be saved. Starting a new request can create a duplicate; your draft stays here.</p><p><button type="button" onClick={() => { submission.current = null; setError(''); }}>Start a new request</button></p></>}
        <button type="submit" disabled={busy}>{busy ? 'Sending request…' : 'Send booking request'}</button>
        {busy && <p role="status">Sending your booking request…</p>}
        </fieldset>
      </form>}
    </section>
  </main>;
}
