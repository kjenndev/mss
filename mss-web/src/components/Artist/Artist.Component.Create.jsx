import { useState, useRef  } from 'react'
import useSWRMutation from 'swr/mutation'
import UserDropdown from '../User/User.Helper.DropDown';
import { useNavigate } from 'react-router-dom';

// Component Declaration
export default function CreateArtist() {
    // Setup refence hooks so we can clear the objects later
    const nameRef = useRef(null);
    const locationRef = useRef(null);
    const descriptionRef = useRef(null);
    const youtubeRef = useRef(null);
    const twitchRef = useRef(null);
    const mixcloudRef = useRef(null);
    const soundcloudRef = useRef(null);

    var selectedUserId = -1;

    const navigate = useNavigate();

    // Set a state object for Artist
    const [artist, setArtist] = useState({
        id: -1,
        name: '',
        location: '',
        description: '',
        youtube: '',
        twitch: '',
        soundcloud: '',
        mixcloud: '',
        userid: -1
    });

    // handle when the select value changes
    function handleArtistChange(e) {
        artist[e.target.name] = e.target.value;
        setArtist(artist);
    }

    // manually handle the API call with this override
    async function CreateArtistHandler(url, data) {
        await fetch(url, {
            method: 'POST',
            body: JSON.stringify(data)
        })
    }

    // Setup the trigger event 
    const { trigger } = useSWRMutation('http://127.0.0.1:5000/artists', CreateArtistHandler, {});

    return (
        <div>
            <UserDropdown onUpdate={(userId) => {  selectedUserId = userId; artist.userid = userId; setArtist(artist); }} />
            <br /><br />
            Create Artist
            <br /><br />

            <label for="name">Artist Name:</label>
            <input type="text" id="name" name="name" ref={nameRef} onChange={(e)=>{ handleArtistChange(e) }}/>
            <br /><br />
            <label for="location">Location:</label>
            <input type="text" id="location" name="location" ref={locationRef} onChange={(e)=>{ handleArtistChange(e) }} />
            <br /><br />
            <label for="description">Description:</label>
            <input type="text" id="description" name="description" ref={descriptionRef} onChange={(e)=>{ handleArtistChange(e) }} />
            <br /><br />
            <label for="youtube">Youtube:</label>
            <input type="text" id="youtube" name="youtube" ref={youtubeRef} onChange={(e)=>{ handleArtistChange(e) }} />
            <br /><br />
            <label for="twitch">Twitch:</label>
            <input type="text" id="twitch" name="twitch" ref={twitchRef} onChange={(e)=>{ handleArtistChange(e) }} />
            <br /><br />
            <label for="mixcloud">Mixcloud:</label>
            <input type="text" id="mixcloud" name="mixcloud" ref={mixcloudRef} onChange={(e)=>{ handleArtistChange(e) }} />
            <br /><br />
            <label for="soundcloud">Soundcloud:</label>
            <input type="text" id="soundcloud" name="soundcloud" ref={soundcloudRef} onChange={(e)=>{ handleArtistChange(e) }} />
            <br /><br />
            <button onClick={() => {
                // Call trigger event passing in thje new artist
                trigger(artist);
                navigate('/artists');

                }}>
                    Create Artist
            </button>
        </div>
  );
}