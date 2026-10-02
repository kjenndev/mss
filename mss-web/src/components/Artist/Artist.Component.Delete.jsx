import DeleteIcon from '@mui/icons-material/Delete';
import Button from '@mui/material/Button';
import * as helpers from '../../Data.Helper.Api';
import { useNavigate } from 'react-router-dom';

export default function DeleteArtist(props) {
  const navigate = useNavigate();

  const handler = async (id) => {
    const response = await helpers.DeleteArtist(id);
    if (!response.ok) {
      navigate('/login');
      return;
    }
    props.onDelete(id);
  };

  if (!helpers.IsAdmin()) {
    return null;
  }

  return (
    <Button startIcon={<DeleteIcon aria-hidden="true" />} size="small" color="error" onClick={() => handler(props.id)}>
      Delete
    </Button>
  );
}
