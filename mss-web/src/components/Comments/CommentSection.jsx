import RefreshIcon from '@mui/icons-material/Refresh';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useState, useEffect, useCallback, useRef } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import ProfileAvatar from '../User/ProfileAvatar';
import Stack from '@mui/material/Stack';
import Divider from '@mui/material/Divider';
import styles from './CommentSection.module.css';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import DeleteIcon from '@mui/icons-material/Delete';

import * as helpers from '../../Data.Helper.Api';

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

  const isAdmin = helpers.IsAdmin();
  // Use the shared session API/event, not a user-editable display name.
  useEffect(() => {
    let current = true, generation = 0;
    async function refreshUser() {
      const request = ++generation;
      setAuthorName(''); setAuthorPicture(null); setAuthError('');
      const signedIn = helpers.HasSession();
      setHasSession(signedIn);
      if (!signedIn) return;
      try {
        const response = await helpers.GetCurrentUser();
        if (!response.ok) throw new Error();
        const { user } = await response.json();
        if (!user?.username) throw new Error();
        if (current && request === generation) { setAuthorName(user.username); setAuthorPicture(user.profile_picture || null); }
      } catch {
        if (current && request === generation) setAuthError('Unable to verify your username. Please sign in again.');
      }
    }
    refreshUser();
    window.addEventListener('mss-auth-change', refreshUser);
    window.addEventListener('mss-avatar-change', refreshUser);
    window.addEventListener('storage', refreshUser);
    return () => { current = false; generation++; window.removeEventListener('mss-auth-change', refreshUser); window.removeEventListener('mss-avatar-change', refreshUser); window.removeEventListener('storage', refreshUser); };
  }, []);

  const fetchComments = useCallback(async (after_id = 0) => {
    const generation = ++loadGeneration.current;
    setLoading(true); setLoadError('');
    try {
      const response = await helpers.GetComments({ ...(artistId ? { artist_id: artistId } : { event_id: eventId }), after_id, limit: 100 });
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (!active.current || generation !== loadGeneration.current) return;
      setComments(previous => [...new Map([...previous, ...(data.comments || [])].map(comment => [comment.id, comment])).values()].sort((a, b) => a.id - b.id));
      setNextCursor(data.has_more ? data.next_cursor : null);
    } catch { if (active.current && generation === loadGeneration.current) setLoadError('Failed to load comments'); }
    finally { if (active.current && generation === loadGeneration.current) setLoading(false); }
  }, [artistId, eventId]);

  useEffect(() => { fetchComments(); }, [fetchComments]);

  async function handlePost() {
    if (posting || !hasSession || !helpers.HasSession() || !authorName || !newComment.trim()) return;

    setPosting(true);
    setError('');
    try {
      const data = {
        content: newComment,
        artist_id: artistId || null,
        event_id: eventId || null,
      };
      const response = await helpers.PostComment(data);
      if (!active.current) return;
      if (response.ok) {
        const { comment } = await response.json();
        if (!active.current) return;
        setComments(previous => [...previous.filter(item => item.id !== comment.id), comment]);
        setNewMessage('');
      } else {
        const data = await response.json();
        if (!active.current) return;
        setError(data.error || 'Failed to post comment');
      }
    } catch (err) {
      if (!active.current) return;
      console.error(err);
      setError('An error occurred');
    } finally {
      if (active.current) setPosting(false);
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

      {hasSession ? <Box component="section" aria-label="Write a comment" className={styles.composer}>
        <Stack direction="row" spacing={2} className={styles.composerRow}>
          <ProfileAvatar src={authorPicture} name={authorName} />
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <TextField
              fullWidth
              size="small"
              label="Username"
              variant="outlined"
              value={authorName}
              slotProps={{ input: { readOnly: true } }}
              sx={{ mb: 2, maxWidth: '300px' }}
            />
            <TextField
              fullWidth
              multiline
              minRows={3}
              label="Comment"
              placeholder="Write a comment..."
              variant="outlined"
              value={newComment}
              onChange={(e) => setNewMessage(e.target.value)}
              sx={{ mb: 2 }}
              required
            />
            <Box display="flex" justifyContent="flex-end">
              <Button
                variant="contained"
                onClick={handlePost}
                disabled={posting || !newComment.trim() || !authorName.trim()}
                startIcon={posting && <CircularProgress size={16} color="inherit" />}
                sx={{ borderRadius: '4px', minHeight: 44, px: 3, textTransform: 'none', fontWeight: 500 }}
              >
                Post Comment
              </Button>
            </Box>
          </Box>
        </Stack>
      </Box> : <Box className={styles.composer}><Typography>Sign in to join the discussion.</Typography><Button href="/login" sx={{ minHeight: 44 }}>Sign in to comment</Button></Box>}

      {authError && <Alert severity="error" sx={{ mb: 3 }}>{authError}<Button href="/login">Sign in</Button></Alert>}
      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      {loadError ? <Alert severity="error">{loadError}<Button startIcon={<RefreshIcon aria-hidden="true" />} onClick={() => fetchComments()}>Retry comments</Button></Alert> : loading ? (
        <Box textAlign="center" py={4}><CircularProgress /></Box>
      ) : (
        <Stack spacing={3}>
          {comments.map((comment) => (
            <Box key={comment.id}>
              <Stack direction="row" spacing={2} alignItems="flex-start">
                <ProfileAvatar src={comment.author_profile_picture} name={comment.author_name} />
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      {comment.author_name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {new Date(comment.created_at).toLocaleString()}
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
              <Divider sx={{ mt: 3, borderColor: '#333' }} />
            </Box>
          ))}
          {nextCursor !== null && <Button startIcon={<ExpandMoreIcon aria-hidden="true" />} onClick={() => fetchComments(nextCursor)}>Load more comments</Button>}
          {comments.length === 0 && (
            <Typography variant="body1" color="text.secondary" textAlign="center" py={4}>
              No comments yet. Be the first to say something!
            </Typography>
          )}
        </Stack>
      )}
    </Box>
  );
}
