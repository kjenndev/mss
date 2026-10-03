import { useEffect, useRef, useState } from 'react';
import DeleteIcon from '@mui/icons-material/Delete';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import * as helpers from '../../Data.Helper.Api';
import { useNavigate } from 'react-router-dom';

export default function DeleteArtist({ id, onDelete }) {
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const active = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);

  const handler = async () => {
    if (deleting || !window.confirm('Are you sure you want to delete this artist?')) return;
    setDeleting(true);
    setError('');
    try {
      const response = await helpers.DeleteArtist(id);
      if (!active.current) return;
      if (!response.ok) {
        if (response.status === 401) navigate('/login');
        else setError('Unable to delete artist. Please try again.');
        return;
      }
      onDelete(id);
    } catch {
      if (active.current) setError('Unable to delete artist. Please try again.');
    } finally {
      if (active.current) setDeleting(false);
    }
  };

  if (!helpers.IsAdmin()) return null;

  return (
    <>
      <Button startIcon={<DeleteIcon aria-hidden="true" />} size="small" color="error" disabled={deleting} onClick={handler} sx={{ minHeight: 44, borderRadius: '4px', textTransform: 'none' }}>
        {deleting ? 'Deleting...' : 'Delete'}
      </Button>
      {error && <Alert severity="error">{error}</Alert>}
    </>
  );
}
