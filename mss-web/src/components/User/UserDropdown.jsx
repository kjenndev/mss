import useSWR from 'swr';
import { useState } from 'react';

const fetcher = (...args) => fetch(...args).then(res => res.json());

export default function UserDropdown(props) {
    const [selectedUserId, setSelectedUserId] = useState(-1);
    console.log('selectedUserId', selectedUserId);
    const { data, error, isLoading } = useSWR(`http://127.0.0.1:5000/users`, fetcher);

    if (error) return <div>failed to load</div>
    if (isLoading) return <div>loading...</div>

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