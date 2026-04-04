import useSWRMutation from 'swr/mutation'
import { useState, useRef } from 'react'

var _user = {
    username: '',
    password: ''
}

async function _CreateUserHandler(url, user) {
    await fetch(url, {
        method: 'POST',
        body: JSON.stringify(user)
    });
}

export default function CreateUser() {
    const [user, setUser] = useState(_user);
    const usernameRef = useRef(null);
    const passwordRef = useRef(null);

    function handleUserChange(e) {
        user[e.target.name] = e.target.value;
        setUser(user);
    }

    const { trigger } = useSWRMutation('http://127.0.0.1:5000/users', _CreateUserHandler, {});

    return (
        <div>
            Create User
            <br /><br />
            <label for="username">Username:</label>
            <input type="text" id="username" name="username" ref={usernameRef} onChange={(e)=>{ handleUserChange(e) }}/>
            <br /><br />
            <label for="password">Password:</label>
            <input type="password" id="password" name="password" ref={passwordRef} onChange={(e)=>{ handleUserChange(e) }} />
            <br /><br />
            <button onClick={() => { 
                trigger(user);
                usernameRef.current.value = '';
                passwordRef.current.value = '';
            }}>
                Create User
            </button>
        </div>
    );
}