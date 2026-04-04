import useSWR from 'swr';
import { useState } from 'react';

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
            <label for="users">Choose a user:</label>
            <select id="users" name="users" value={selectedUserId} onChange={changeHandler}>
                <option value="">--Please choose a user--</option>
                {data.map(u => (
                    <option value={u.id}>{u.username}</option>
                ))}
            </select>
        </>
    )

}   