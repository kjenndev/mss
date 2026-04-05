import useSWRMutation from 'swr/mutation'
import useSWR from 'swr';
import { useState, useRef } from 'react'
import { useParams } from 'react-router-dom';

// setup the fetcher for the SWR lib
const fetcher = (...args) => fetch(...args).then(res => res.json());

// handle any textbox change events
function handleChange(e, artist, setArtist) {
    artist[e.target.name] = e.target.value;
    setArtist(artist);
}

// manually handle the API call with this override
async function UpdateArtist(url, artist) {
    await fetch(url, {
        method: 'PUT',
        body: JSON.stringify(artist)
    });
}

// Component declaration
export default function ArtistUpdate() {
    // Get the Id from the URL params
    const { id } = useParams();
    // Call the API and get the Artist by Id
    const { data, error, isLoading } = useSWR(`http://127.0.0.1:5000/artists/${id}`, fetcher, { suspense: true });
    
    if (error) return <div>failed to load</div>
    if (isLoading) return <div>loading...</div>

    // Set a state object for Artist
    const [artist, setArtist] = useState(data);
    // Setup the trigger event 
    const { trigger } = useSWRMutation(`http://127.0.0.1:5000/artists/${id}`, UpdateArtist, { suspense: true });

    return (
        <div>
            Create Artist
            <br /><br />
            <label for="name">Artist Name:</label>
            <input type="text" id="name" name="name" defaultValue={artist.name} onChange={(e)=>{ handleChange(e, artist, setArtist) }}/>
            <br /><br />
            <label for="location">Location:</label>
            <input type="text" id="location" name="location" defaultValue={artist.location} onChange={(e)=>{ handleChange(e, artist, setArtist) }} />
            <br /><br />
            <label for="description">Description:</label>
            <input type="text" id="description" name="description" defaultValue={artist.description} onChange={(e)=>{ handleChange(e, artist, setArtist) }} />
            <br /><br />
            <label for="youtube">Youtube:</label>
            <input type="text" id="youtube" name="youtube" defaultValue={artist.youtube} onChange={(e)=>{ handleChange(e, artist, setArtist) }} />
            <br /><br />
            <label for="twitch">Twitch:</label>
            <input type="text" id="twitch" name="twitch" defaultValue={artist.twitch} onChange={(e)=>{ handleChange(e, artist, setArtist) }} />
            <br /><br />
            <label for="mixcloud">Mixcloud:</label>
            <input type="text" id="mixcloud" name="mixcloud" defaultValue={artist.mixcloud} onChange={(e)=>{ handleChange(e, artist, setArtist) }} />
            <br /><br />
            <label for="soundcloud">Soundcloud:</label>
            <input type="text" id="soundcloud" name="soundcloud" defaultValue={artist.soundcloud} onChange={(e)=>{ handleChange(e, artist, setArtist) }} />
            <br /><br />
            <button onClick={() => {
                // Call the trigger event passing in the updated artist
                trigger(artist);
                }}>
                    Update Artist
            </button>
        </div>
  );
}