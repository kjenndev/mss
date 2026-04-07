import Button from '@mui/material/Button';
import * as helpers from '../../Data.Helper.Api';
import { useNavigate } from 'react-router-dom';

// component declaration
export default function DeleteArtist(props) {
    const navigate = useNavigate();
    const handler = (id) => {
        // Side effect logic here
        helpers.DeleteArtist(id).then((res) => {
            if (res.status === 401) {
                localStorage.removeItem('session-id')
                localStorage.removeItem('session-userid')
                navigate('/login')
            } else {
                props.onDelete(id)
            }
        });
    }
   
    return <Button size="small" onClick={() => { handler(props.id); }}>Delete</Button>
}