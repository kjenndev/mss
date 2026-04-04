import useSWRMutation from 'swr/mutation'
import { useState, useRef } from 'react'

// Representation of an empty User object
var _user = {
    username: '',
    password: ''
}

// Manually handle the API call
async function _CreateUserHandler(url, user) {
    await fetch(url, {
        method: 'POST',
        body: JSON.stringify(user)
    });
}

// Component Declaration
export default function CreateUser() {
    // Setup a state object for User
    const [user, setUser] = useState(_user);
    // Setup refences to the DOM objects via ref hooks
    const usernameRef = useRef(null);
    const passwordRef = useRef(null);

    // Handle when a textbox value changes
    function handleUserChange(e) {
        user[e.target.name] = e.target.value;
        setUser(user);
    }

    // Setup the trigger event
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
                // trigger the event passing in the new user
                trigger(user);
                // clear the inputs
                usernameRef.current.value = '';
                passwordRef.current.value = '';
            }}>
                Create User
            </button>
        </div>
    );
}