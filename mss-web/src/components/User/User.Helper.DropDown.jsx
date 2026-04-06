import useSWR from 'swr';
import { useState } from 'react';
import Box from '@mui/material/Box';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import Select from '@mui/material/Select';

// setup the fetcher for the SWR lib
const fetcher = (...args) => fetch(...args).then(res => res.json());

// Component declaration
export default function UserDropdown(props) {
    // Setup a state object for the selected user in the dropdown
    const [selectedUserId, setSelectedUserId] = useState(-1);

    // Call the API and get a list of the Users
    const { data, error, isLoading } = useSWR(`http://127.0.0.1:5000/users`, fetcher);

    if (error) return <div>failed to load</div>
    if (isLoading) return <div>loading...</div>

    // Hanlde when the dropdown selection changes
    const changeHandler = (e) => {
        setSelectedUserId(e.target.value);
        props.onUpdate(e.target.value);
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
                    {data.map(u => (
                        <MenuItem value={u.id}>{u.username}</MenuItem>
                    ))}
                </Select>
            </Box>
        </>
    )

}   