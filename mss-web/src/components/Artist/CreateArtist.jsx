import useSWRMutation from 'swr/mutation'
import { useState, useRef, useContext  } from 'react'
import UserDropdown from '../User/UserDropdown';

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

async function _CreateArtistHandler(url, artist) {
    await fetch(url, {
        method: 'POST',
        body: JSON.stringify(artist)
    });
}

export default function CreateArtist() {
    const [artist, setArtist] = useState(_artist);

    const nameRef = useRef(null);
    const locationRef = useRef(null);
    const descriptionRef = useRef(null);
    const youtubeRef = useRef(null);
    const twitchRef = useRef(null);
    const mixcloudRef = useRef(null);
    const soundcloudRef = useRef(null);

    var selectedUserId = -1;

    function handleArtistChange(e) {
        artist[e.target.name] = e.target.value;
        setArtist(artist);
    }

    const { trigger } = useSWRMutation('http://127.0.0.1:5000/artists', _CreateArtistHandler, {});

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
                trigger(artist);
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