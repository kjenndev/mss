import { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import InputLabel from '@mui/material/InputLabel';
import FormControl from '@mui/material/FormControl';

import * as helpers from '../../Data.Helper.Api';

export default function UserDropdown(props) {
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');

  const changeHandler = (e) => {
    setSelectedUserId(e.target.value);
    props.onUpdate(e.target.value);
  };

  useEffect(() => {
    helpers.GetAllUsers().then(async (response) => {
      if (response.ok) {
        const data = await response.json();
        setUsers(data.users || []);
      }
    });
  }, []);

  if (!users || users.length === 0) {
    return null;
  }

  return (
    <Box sx={{ minWidth: 240, mb: 2 }}>
      <FormControl fullWidth>
        <InputLabel id="user-select-label">Artist User</InputLabel>
        <Select
          labelId="user-select-label"
          id="user-select"
          value={selectedUserId}
          label="Artist User"
          onChange={changeHandler}
        >
          <MenuItem value="">Choose a User</MenuItem>
          {users.map((u) => (
            <MenuItem key={u.id} value={u.id}>
              {u.username}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    </Box>
  );
}
   