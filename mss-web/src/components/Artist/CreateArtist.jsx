import useSWRMutation from 'swr/mutation'
import { useState, useRef, useContext  } from 'react'
import UserDropdown from '../User/UserDropdown';

// Representation of an empty artist object
var _artist = {
    name: '',
    location: '',
    description: '',
    youtube: '',
    twitch: '',
    mixcloud: '', 
    soundcloud: '',
    userid: -1
}

// manually handle the API call with this override
async function CreateArtistHandler(url, artist) {
    await fetch(url, {
        method: 'POST',
        body: JSON.stringify(artist)
    });
}

// Component Declaration
export default function CreateArtist() {
    // Setup state object for Artist
    const [artist, setArtist] = useState(_artist);

    // Setup refence hooks so we can clear the objects later
    const nameRef = useRef(null);
    const locationRef = useRef(null);
    const descriptionRef = useRef(null);
    const youtubeRef = useRef(null);
    const twitchRef = useRef(null);
    const mixcloudRef = useRef(null);
    const soundcloudRef = useRef(null);

    var selectedUserId = -1;

    // handle when the select value changes
    function handleArtistChange(e) {
        artist[e.target.name] = e.target.value;
        setArtist(artist);
    }

    // Setup the trigger event 
    const { trigger } = useSWRMutation('http://127.0.0.1:5000/artists', CreateArtistHandler, {});

    return (
        <div>
            <UserDropdown onUpdate={(userId) => {  selectedUserId = userId; artist.userid = userId; }} />
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
                // Call trigger event passing in the new artist
                trigger(artist);
                // clear the values
                nameRef.current.value = '';
                locationRef.current.value = '';
                descriptionRef.current.value = '';
                youtubeRef.current.value = '';
                twitchRef.current.value = '';
                mixcloudRef.current.value = '';
                soundcloudRef.current.value = '';
                }}>
                    Create Artist
            </button>
        </div>
  );
}