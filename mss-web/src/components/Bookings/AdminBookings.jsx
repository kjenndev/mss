import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import * as api from '../../Data.Helper.Api';
import styles from './Bookings.module.css';
import { Button, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions } from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { createTheme, ThemeProvider } from '@mui/material/styles';
const darkTheme = createTheme({ palette: { mode: 'dark', primary: { main: '#90caf9' } } });

function sessionSnapshot() { return JSON.stringify([localStorage.getItem('mss-token'), localStorage.getItem('mss-role')]); }
async function readResponse(response) {
  const data = await response.json();
  if (!response.ok) throw Object.assign(Error(), { userMessage: typeof data.error === 'string' ? data.error : 'Unable to complete booking operation. Please retry.' });
  return data;
}
export default function AdminBookings() {
  const [page, setPage] = useState(1), [attempt, setAttempt] = useState(0);
  const [target, setTarget] = useState(null), [busy, setBusy] = useState(false);
  const [deleteError, setDeleteError] = useState(''), [success, setSuccess] = useState('');
  const mounted = useRef(false), pending = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const closeDelete = () => { if (!pending.current) { setTarget(null); setDeleteError(''); } };
  async function deleteBooking() {
    if (!target || pending.current) return;
    const identity = target.identity;
    if (identity !== sessionSnapshot()) { setDeleteError('Your account changed. Reload the inbox before deleting.'); return; }
    pending.current = true; setBusy(true); setDeleteError(''); setSuccess('');
    const current = () => mounted.current && identity === sessionSnapshot();
    try {
      const result = await api.DeleteBooking(target.id).then(readResponse);
      if (result.deleted !== true) throw Error('Unconfirmed deletion');
      if (current()) {
        setTarget(null); setSuccess(`Booking request ${target.reference} deleted permanently.`);
        setState({ loading: true }); setAttempt(n => n + 1);
      }
    } catch (err) { if (current()) setDeleteError(err.userMessage || 'Unable to delete booking request. Please retry.'); }
    finally { pending.current = false; if (current()) setBusy(false); }
  }
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    let active = true;
    const identity = sessionSnapshot(), current = () => active && identity === sessionSnapshot();
    api.GetBookings(page, 20).then(readResponse).then(data => {
      if (!Array.isArray(data.requests) || !Number.isSafeInteger(data.total) || data.total < 0) throw Error('Unable to load booking requests. Please retry.');
      if (current()) {
        const lastPage = Math.max(1, Math.ceil(data.total / 20));
        if (page > lastPage) { setState({ loading: true }); setPage(lastPage); }
        else setState({ data });
      }
    }).catch(() => { if (current()) setState({ error: 'Unable to load booking requests. Please retry.' }); });
    return () => { active = false; };
  }, [page, attempt]);
  return <ThemeProvider theme={darkTheme}><main className={styles.page}><header><p>SYNDICATE / ADMINISTRATION</p><h1>Booking inbox</h1><p>Private requests. Shared planning. Keep the next night moving.</p></header>
    {success && <p role="status">{success}</p>}
    {state.loading ? <p role="status">Loading booking requests…</p> : state.error ? <><p role="alert">{state.error}</p><button onClick={() => { setState({ loading: true }); setAttempt(n => n + 1); }}>Retry</button></> : <>
      <p>{state.data.total} requests · Page {page}</p>
      {state.data.requests.length === 0 ? <p>No booking requests on this page.</p> : <ul>{state.data.requests.map(booking => <li key={booking.id}>
        <h2><Link to={`/admin/bookings/${booking.id}`}>{booking.venue_name}</Link></h2>
        <p>{booking.reference} · {booking.contact_name}</p><p>Event: {booking.event_date || 'Not specified'} · Received: <time dateTime={booking.created_at}>{new Date(booking.created_at).toLocaleString()}</time></p>
        <p>{booking.comment_count} comments · Email: {booking.notification_status}</p>
        <Button className={styles.deleteAction} color="error" startIcon={<DeleteOutlineIcon />} aria-label={`Delete booking request ${booking.reference}`} onClick={() => { setDeleteError(''); setTarget({ ...booking, identity: sessionSnapshot() }); }} sx={{ minHeight: 44 }}>Delete request</Button>
      </li>)}</ul>}
      <nav aria-label="Booking inbox pages"><button disabled={page === 1} onClick={() => { setState({ loading: true }); setPage(n => n - 1); }}>Previous page</button><button disabled={page * 20 >= state.data.total} onClick={() => { setState({ loading: true }); setPage(n => n + 1); }}>Next page</button></nav>
    </>}
    <Dialog open={!!target} onClose={closeDelete} disableEscapeKeyDown={busy} aria-labelledby="delete-booking-title" aria-describedby="delete-booking-description" maxWidth="sm" fullWidth slotProps={{ paper: { sx: { borderRadius: 1, overflowWrap: 'anywhere' } } }}>
      <DialogTitle id="delete-booking-title">Delete booking request?</DialogTitle>
      <DialogContent><DialogContentText id="delete-booking-description">
        Permanently delete {target?.venue_name} ({target?.reference}), its internal comments and queued notifications? This cannot be undone. Emails already sent or in flight cannot be recalled.
      </DialogContentText>{deleteError && <p role="alert" style={{ color: '#ffb9b3' }}>{deleteError}</p>}</DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', px: 3, pb: 2 }}><Button autoFocus disabled={busy} onClick={closeDelete} sx={{ minHeight: 44 }}>Cancel</Button><Button color="error" variant="contained" disabled={busy} onClick={deleteBooking} sx={{ minHeight: 44 }}>{busy ? 'Deleting…' : 'Permanently delete'}</Button></DialogActions>
    </Dialog>
  </main></ThemeProvider>;
}
export function BookingDetail() {
  const { id } = useParams();
  return <Detail key={id} id={id} />;
}
function Detail({ id }) {
  const [state, setState] = useState({ loading: true }), [attempt, setAttempt] = useState(0);
  const [content, setContent] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [success, setSuccess] = useState('');
  const mounted = useRef(false), pending = useRef(false), submission = useRef(null);
  useEffect(() => {
    let active = true; mounted.current = true;
    const identity = sessionSnapshot(), current = () => active && identity === sessionSnapshot();
    api.GetBooking(id).then(readResponse).then(data => {
      if (!data.booking || !Array.isArray(data.comments)) throw Error('Unable to load booking request.');
      if (current()) setState({ data });
    }).catch(err => { if (current()) setState({ error: err.userMessage || 'Unable to load booking request. Please retry.' }); });
    return () => { active = false; mounted.current = false; };
  }, [id, attempt]);
  async function comment(e) {
    e.preventDefault();
    if (pending.current) return;
    setSuccess('');
    if (!content.trim() || content.length > 3000) { setError('Enter a comment of 1–3000 characters.'); return; }
    pending.current = true; setBusy(true); setError('');
    const identity = sessionSnapshot(), current = () => mounted.current && identity === sessionSnapshot();
    submission.current ||= crypto.randomUUID();
    try {
      const data = await api.AddBookingComment(id, { content, submission_id: submission.current }).then(readResponse);
      if (!data.comment?.id) throw Error('Unable to confirm your comment. Please retry.');
      if (current()) {
        setState(s => ({ data: { ...s.data, comments: [...s.data.comments.filter(c => c.id !== data.comment.id), data.comment] } }));
        setContent(''); submission.current = null; setSuccess('Comment added.');
      }
    } catch (err) { if (current()) setError(err.userMessage || 'Unable to add comment. Please retry.'); }
    finally { pending.current = false; if (current()) setBusy(false); }
  }
  const booking = state.data?.booking;
  return <main className={styles.page}><Link to="/admin/bookings">Back to booking inbox</Link>
    {state.loading ? <p role="status">Loading booking request…</p> : state.error ? <><p role="alert">{state.error}</p><button onClick={() => { setState({ loading: true }); setAttempt(n => n + 1); }}>Retry</button></> : <>
      <header><p>{booking.reference}</p><h1>{booking.venue_name}</h1><p>Received <time dateTime={booking.created_at}>{new Date(booking.created_at).toLocaleString()}</time></p></header>
      <section aria-label="Request details"><h2>Request details</h2><dl>{[['Contact', booking.contact_name], ['Email', booking.email], ['Phone', booking.phone], ['Event date', booking.event_date], ['Location', booking.location], ['Event type', booking.event_type], ['Estimated attendance', booking.estimated_attendance], ['Budget', booking.budget], ['Services', (booking.services || []).map(s => ({ djs: 'DJs', lasers: 'Laser art', streaming: 'Live streaming' })[s] || s).join(', ')]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value === 0 ? 0 : value || 'Not specified'}</dd></div>)}</dl><h3>Event brief</h3><p className={styles.brief}>{booking.message}</p></section>
      <section aria-labelledby="comments-title"><h2 id="comments-title">Internal comments</h2><p>Only administrators can see these comments. They are not sent to the requester.</p>
        {state.data.comments.length ? <ul>{state.data.comments.map(c => <li key={c.id}><strong>{c.author_name}</strong> · <time dateTime={c.created_at}>{new Date(c.created_at).toLocaleString()}</time><p>{c.content}</p></li>)}</ul> : <p>No internal comments yet.</p>}
        <form onSubmit={comment} noValidate><label htmlFor="internal-comment">Internal comment</label><textarea id="internal-comment" value={content} maxLength={3000} disabled={busy} onChange={e => setContent(e.target.value)} aria-describedby="comment-help" /><p id="comment-help">Up to 3000 characters. Admin-only.</p>
          {error && <><p role="alert">{error}</p><p>Retry unchanged to avoid duplicates, or start a new comment before changing the submitted text.</p><p><button type="button" disabled={busy} onClick={() => { submission.current = null; setError(''); }}>Start a new comment</button></p></>}{success && <p role="status">{success}</p>}<button disabled={busy}>{busy ? 'Saving comment…' : 'Add comment'}</button>
        </form>
      </section>
    </>}
  </main>;
}
