import { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Avatar from '@mui/material/Avatar';
import Stack from '@mui/material/Stack';
import Divider from '@mui/material/Divider';
import Paper from '@mui/material/Paper';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import DeleteIcon from '@mui/icons-material/Delete';

import * as helpers from '../../Data.Helper.Api';

export default function CommentSection({ artistId, eventId }) {
  const [comments, setComments] = useState([]);
  const [newComment, setNewMessage] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');

  const currentUserId = helpers.GetSessionUserId();
  const isAdmin = helpers.IsAdmin();
  const hasSession = helpers.HasSession();

  // Initialize author name from session if available
  useEffect(() => {
    if (hasSession) {
        helpers.GetCurrentUser().then(async (res) => {
            if (res.ok) {
                const data = await res.json();
                setAuthorName(data.user.display_name || data.user.username || '');
            }
        });
    }
  }, [hasSession]);

  useEffect(() => {
    fetchComments();
  }, [artistId, eventId]);

  async function fetchComments() {
    setLoading(true);
    try {
      const params = artistId ? { artist_id: artistId } : { event_id: eventId };
      const response = await helpers.GetComments(params);
      if (response.ok) {
        const data = await response.json();
        setComments(data.comments || []);
      }
    } catch (err) {
      console.error(err);
      setError('Failed to load comments');
    } finally {
      setLoading(false);
    }
  }

  async function handlePost() {
    if (!newComment.trim()) return;
    if (!authorName.trim()) {
        setError('Please enter your name.');
        return;
    }

    setPosting(true);
    setError('');
    try {
      const data = {
        content: newComment,
        author_name: authorName,
        artist_id: artistId || null,
        event_id: eventId || null,
      };
      const response = await helpers.PostComment(data);
      if (response.ok) {
        const { comment } = await response.json();
        setComments([...comments, comment]);
        setNewMessage('');
        // Keep the author name for the next comment
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to post comment');
      }
    } catch (err) {
      console.error(err);
      setError('An error occurred');
    } finally {
      setPosting(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this comment?')) return;
    try {
      const response = await helpers.DeleteComment(id);
      if (response.ok) {
        setComments(comments.filter(c => c.id !== id));
      }
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 3 }}>
        Comments ({comments.length})
      </Typography>

      <Paper elevation={0} sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, mb: 4, border: '1px solid rgba(255,255,255,0.05)' }}>
        <Stack direction="row" spacing={2}>
          <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.1)' }}>
            {(authorName || '?').charAt(0).toUpperCase()}
          </Avatar>
          <Box sx={{ flexGrow: 1 }}>
            <TextField
              fullWidth
              size="small"
              label="Your Name"
              placeholder="Enter your name..."
              variant="outlined"
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              sx={{ mb: 2, maxWidth: '300px' }}
              required
            />
            <TextField
              fullWidth
              multiline
              minRows={3}
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
                sx={{ borderRadius: '12px', px: 4, textTransform: 'none', fontWeight: 700 }}
              >
                Post Comment
              </Button>
            </Box>
          </Box>
        </Stack>
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      {loading ? (
        <Box textAlign="center" py={4}><CircularProgress /></Box>
      ) : (
        <Stack spacing={3}>
          {comments.map((comment) => (
            <Box key={comment.id}>
              <Stack direction="row" spacing={2} alignItems="flex-start">
                <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.1)' }}>
                  {(comment.author_name || '?').charAt(0).toUpperCase()}
                </Avatar>
                <Box sx={{ flexGrow: 1 }}>
                  <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      {comment.author_name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {new Date(comment.created_at).toLocaleString()}
                    </Typography>
                  </Box>
                  <Typography variant="body1" sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>
                    {comment.content}
                  </Typography>
                  
                  {isAdmin && (
                    <Box display="flex" gap={2} mt={1}>
                      <Button 
                        size="small" 
                        color="error" 
                        startIcon={<DeleteIcon />} 
                        onClick={() => handleDelete(comment.id)}
                        sx={{ textTransform: 'none', minWidth: 0, p: 0, opacity: 0.7, '&:hover': { opacity: 1 } }}
                      >
                        Delete
                      </Button>
                    </Box>
                  )}
                </Box>
              </Stack>
              <Divider sx={{ mt: 3, opacity: 0.05 }} />
            </Box>
          ))}
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
