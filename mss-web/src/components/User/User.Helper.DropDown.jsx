import { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';

import * as helpers from '../../Data.Helper.Api';

// Component declaration
export default function UserDropdown(props) {
    // Setup a state object for the selected user in the dropdown
    const [users, setUsers] = useState([]);
    const [selectedUserId, setSelectedUserId] = useState(-1);

    // Hanlde when the dropdown selection changes
    const changeHandler = (e) => {
        setSelectedUserId(e.target.value);
        props.onUpdate(e.target.value);
    }

    useEffect(() => {
        // Side effect logic here
        helpers.GetAllUsers().then(response => {
            response.json().then(res => {
                setUsers(res);
            });
        });
    }, []);


    if (!users){
        return ''
    }

    return (
        <>
            <Box>
                <Select
                    id="user-select"
                    value={selectedUserId}
                    label="Age"
                    onChange={changeHandler}>
                        <MenuItem value={-1}>Choose a User</MenuItem>
                    {users.map(u => (
                        <MenuItem value={u.id}>{u.username}</MenuItem>
                    ))}
                </Select>
            </Box>
        </>
    )

}   