import RefreshIcon from '@mui/icons-material/Refresh';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useState, useEffect, useCallback, useRef, useId } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import ProfileAvatar from '../User/ProfileAvatar';
import { getImageUrl } from '../../config';
import Stack from '@mui/material/Stack';
import Divider from '@mui/material/Divider';
import styles from './CommentSection.module.css';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import DeleteIcon from '@mui/icons-material/Delete';

import * as helpers from '../../Data.Helper.Api';

// Unknown historical dates sort last; IDs make equal timestamps deterministic.
function newestFirst(a, b) {
  const time = value => Number.isFinite(Date.parse(value)) ? Date.parse(value) : -Infinity;
  const difference = time(b.created_at) - time(a.created_at);
  if (difference && Number.isFinite(difference)) return difference;
  if (time(a.created_at) !== time(b.created_at)) return time(a.created_at) < time(b.created_at) ? 1 : -1;
  const fraction = value => /\.(\d+)Z$/.exec(value || '')?.[1]?.padEnd(6, '0') || '000000';
  return fraction(b.created_at).localeCompare(fraction(a.created_at)) || b.id - a.id;
}

export default function CommentSection({ artistId, eventId }) {
  return <CommentThread key={`${artistId ?? ''}:${eventId ?? ''}`} artistId={artistId} eventId={eventId} />;
}

function CommentThread({ artistId, eventId }) {
  const active = useRef(false);
  const loadGeneration = useRef(0);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; loadGeneration.current += 1; };
  }, []);
  const [comments, setComments] = useState([]);
  const [newComment, setNewMessage] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [authorPicture, setAuthorPicture] = useState(null);
  const [hasSession, setHasSession] = useState(helpers.HasSession);
  const [authError, setAuthError] = useState('');
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [identityRejected, setIdentityRejected] = useState(false);

  const isAdmin = helpers.IsAdmin();
  const identityId = useId();
  const [identities, setIdentities] = useState([]);
  const [selectedIdentity, setSelectedIdentity] = useState('');
  const [identityReady, setIdentityReady] = useState(false);
  const accountToken = useRef(localStorage.getItem('mss-token'));
  const accountGeneration = useRef(0);
  // Use the shared session API/event, not a user-editable display name.
  useEffect(() => {
    let current = true, generation = 0;
    async function refreshUser() {
      const request = ++generation;
      const token = localStorage.getItem('mss-token');
      if (token !== accountToken.current) {
        accountToken.current = token; accountGeneration.current++;
        setIdentities([]); setSelectedIdentity(''); setNewMessage(''); setPosting(false); setError(''); setIdentityRejected(false);
      }
      setAuthorName(''); setAuthorPicture(null); setAuthError(''); setIdentityReady(false);
      const signedIn = helpers.HasSession();
      setHasSession(signedIn);
      if (!signedIn) { setIdentities([]); setSelectedIdentity(''); return; }
      try {
        const response = await helpers.GetCurrentUser();
        if (!response.ok) throw new Error();
        const { user } = await response.json();
        if (!user?.username) throw new Error();
        const allowed = await helpers.GetCommentIdentities();
        if (!allowed.ok) throw new Error();
        const data = await allowed.json();
        if (!Array.isArray(data.identities) || data.identities.some(a => !Number.isSafeInteger(a.id) || a.id < 1 || typeof a.name !== 'string' || !a.name.trim())) throw new Error();
        if (current && request === generation && token === localStorage.getItem('mss-token')) {
          const artists = data.identities;
          setAuthorName(user.username); setAuthorPicture(user.profile_picture || null);
          setIdentities(artists);
          setSelectedIdentity(previous => artists.some(a => String(a.id) === previous) ? previous
            : String((artists.find(a => Number(a.id) === Number(artistId)) || artists[0])?.id ?? ''));
          setIdentityReady(true);
        }
      } catch {
        if (current && request === generation && token === localStorage.getItem('mss-token')) setAuthError('Unable to verify your username or posting identities. Please retry or sign in again.');
      }
    }
    refreshUser();
    window.addEventListener('mss-auth-change', refreshUser);
    window.addEventListener('mss-avatar-change', refreshUser);
    window.addEventListener('storage', refreshUser);
    return () => { current = false; generation++; window.removeEventListener('mss-auth-change', refreshUser); window.removeEventListener('mss-avatar-change', refreshUser); window.removeEventListener('storage', refreshUser); };
  }, [artistId]);

  const fetchComments = useCallback(async (before) => {
    const generation = ++loadGeneration.current;
    setLoading(true); setLoadError('');
    try {
      const response = await helpers.GetComments({ ...(artistId ? { artist_id: artistId } : { event_id: eventId }), order: 'newest', ...(before ? { before } : {}), limit: 100 });
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (!active.current || generation !== loadGeneration.current) return;
      if (!Array.isArray(data.comments) || (data.has_more && (typeof data.next_cursor !== 'string' || !data.next_cursor || data.next_cursor === before))) throw new Error();
      setComments(previous => [...new Map([...previous, ...(data.comments || [])].map(comment => [comment.id, comment])).values()].sort(newestFirst));
      setNextCursor(data.has_more ? data.next_cursor : null);
    } catch { if (active.current && generation === loadGeneration.current) setLoadError('Failed to load comments'); }
    finally { if (active.current && generation === loadGeneration.current) setLoading(false); }
  }, [artistId, eventId]);

  useEffect(() => { fetchComments(); }, [fetchComments]);

  async function handlePost() {
    if (posting || !identityReady || !hasSession || !helpers.HasSession() || !authorName || !newComment.trim()) return;

    const token = localStorage.getItem('mss-token');
    const generation = accountGeneration.current;
    const draft = newComment;
    const stillCurrent = () => active.current && token === localStorage.getItem('mss-token') && generation === accountGeneration.current;
    setPosting(true);
    setError(''); setIdentityRejected(false);
    try {
      const data = {
        content: newComment,
        artist_id: artistId || null,
        event_id: eventId || null,
        ...(selectedIdentity ? { author_artist_id: Number(selectedIdentity) } : {}),
      };
      const response = await helpers.PostComment(data);
      if (!stillCurrent()) return;
      if (response.ok) {
        const { comment } = await response.json();
        if (!stillCurrent()) return;
        if (!comment || !Number.isSafeInteger(comment.id) || typeof comment.content !== 'string') throw new Error();
        setComments(previous => [...previous.filter(item => item.id !== comment.id), comment].sort(newestFirst));
        setNewMessage(current => current === draft ? '' : current);
      } else {
        const data = await response.json();
        if (!stillCurrent()) return;
        setIdentityRejected(response.status === 401 || response.status === 403);
        setError(data.error || 'Failed to post comment');
      }
    } catch (err) {
      if (!stillCurrent()) return;
      console.error(err);
      setError('An error occurred');
    } finally {
      if (stillCurrent()) setPosting(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this comment?')) return;
    try {
      const response = await helpers.DeleteComment(id);
      if (!active.current) return;
      if (response.ok) {
        setComments(previous => previous.filter(c => c.id !== id));
      } else { setError('Failed to delete comment. Please retry Delete.'); }
    } catch { if (active.current) setError('Failed to delete comment. Please retry Delete.'); }
  }

  return (
    <Box className={styles.comments}>
      <Typography component="h3" variant="h5" sx={{ fontSize: 20, fontWeight: 600, mb: 3 }}>
        Comments ({comments.length})
      </Typography>

      {authError && <Alert severity="error" sx={{ mb: 3 }}>{authError}<Button onClick={() => window.dispatchEvent(new CustomEvent('mss-avatar-change'))}>Retry identity</Button><Button href="/login">Sign in</Button></Alert>}
      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}{identityRejected && <Button sx={{ minHeight: 44 }} onClick={() => window.dispatchEvent(new CustomEvent('mss-avatar-change'))}>Refresh posting identity</Button>}</Alert>}

      {hasSession ? <Box component="section" aria-label="Write a comment" className={styles.composer}>
        <Box className={styles.composerHeader}>
          <Box className={styles.account}>
            <ProfileAvatar src={authorPicture} name={authorName} sx={{ width: 36, height: 36 }} />
            <Box sx={{ minWidth: 0 }}><Typography variant="caption" color="text.secondary">Signed in as</Typography>
              <input className={styles.accountName} aria-label="Username" value={authorName} readOnly />
            </Box>
          </Box>
          <Box className={styles.identity}>
            <label htmlFor={identityId}>Posting as</label>
            {identities.length > 1 ? <select id={identityId} value={selectedIdentity} disabled={!identityReady || posting} onChange={e => setSelectedIdentity(e.target.value)}>
              {identities.map(artist => <option key={artist.id} value={artist.id}>{artist.name}{Number(artist.id) === Number(artistId) ? ' · This profile' : ''}</option>)}
            </select> : <Typography id={identityId} className={styles.authorIdentity}>{identityReady ? identities[0]?.name || authorName : 'Verifying identity…'}</Typography>}
          </Box>
        </Box>
        <TextField fullWidth multiline minRows={3} label="Comment" placeholder="Write a comment..." variant="outlined" value={newComment} onChange={e => setNewMessage(e.target.value)} slotProps={{ inputLabel: { shrink: true }, htmlInput: { maxLength: 5000 } }} required />
        <Box className={styles.composerFooter}>
          <Typography variant="caption" color="text.secondary">{identityReady && (identities.length ? 'Posting with your associated artist identity.' : 'Posting with your username.')}</Typography>
          <Button variant="contained" onClick={handlePost} disabled={posting || !identityReady || !newComment.trim() || !authorName.trim()} startIcon={posting && <CircularProgress size={16} color="inherit" />} sx={{ borderRadius: '4px', minHeight: 44, px: 3, textTransform: 'none', fontWeight: 500 }}>Post Comment</Button>
        </Box>
      </Box> : <Box className={styles.composer}><Typography>Sign in to join the discussion.</Typography><Button href="/login" sx={{ minHeight: 44 }}>Sign in to comment</Button></Box>}

      {loadError ? <Alert severity="error">{loadError}<Button startIcon={<RefreshIcon aria-hidden="true" />} onClick={() => fetchComments(nextCursor || undefined)}>Retry comments</Button></Alert> : null}
      {loading && (
        <Box textAlign="center" py={4}><CircularProgress /></Box>
      )}
      <Box sx={{ mt: 3 }}>
        <Stack spacing={2}>
          {comments.map((comment) => (
            <Box key={comment.id}>
              <Stack direction="row" spacing={2} alignItems="flex-start">
                <ProfileAvatar src={comment.author_artist_name ? (getImageUrl(comment.author_artist_profile_picture) ? comment.author_artist_profile_picture : null) : comment.author_profile_picture} name={comment.author_name} sx={{ width: 36, height: 36 }} />
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      {comment.author_name}{comment.author_artist_name && <span className={styles.artistBadge} title="Artist identity at time of posting">Artist</span>}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {Number.isFinite(Date.parse(comment.created_at)) ? new Date(comment.created_at).toLocaleString() : ''}
                    </Typography>
                  </Box>
                  <Typography variant="body1" sx={{ mt: 0.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                    {comment.content}
                  </Typography>

                  {isAdmin && (
                    <Box display="flex" gap={2} mt={1}>
                      <Button
                        size="small"
                        color="error"
                        startIcon={<DeleteIcon />}
                        onClick={() => handleDelete(comment.id)}
                        sx={{ textTransform: 'none', minWidth: 44, minHeight: 44, px: 1, opacity: 0.85, '&:hover': { opacity: 1 } }}
                      >
                        Delete
                      </Button>
                    </Box>
                  )}
                </Box>
              </Stack>
              <Divider sx={{ mt: 2, borderColor: '#333' }} />
            </Box>
          ))}
          {nextCursor !== null && <Button disabled={loading} startIcon={<ExpandMoreIcon aria-hidden="true" />} onClick={() => fetchComments(nextCursor)}>Load more comments</Button>}
          {!loading && !loadError && comments.length === 0 && (
            <Typography variant="body1" color="text.secondary" textAlign="center" py={4}>
              No comments yet. Be the first to say something!
            </Typography>
          )}
        </Stack>
      </Box>


    </Box>
  );
}
