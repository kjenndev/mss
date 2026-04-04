import useSWRMutation from 'swr/mutation'
import useSWR from 'swr';
import { useState, useRef } from 'react'
import { useParams } from 'react-router-dom';

var _artist = {
    name: '',
    location: '',
    description: '',
    youtube: '',
    twitch: '',
    mixcloud: '', 
    soundcloud: '',
    userId: -1
}

const fetcher = (...args) => fetch(...args).then(res => res.json());

function handleChange(e, artist, setArtist) {
    artist[e.target.name] = e.target.value;
    setArtist(artist);
}

async function UpdateArtist(url, artist) {
    await fetch(url, {
        method: 'PUT',
        body: JSON.stringify(artist)
    });
}

export default function ArtistUpdate() {
    const { id } = useParams();
    const { data, error, isLoading } = useSWR(`http://127.0.0.1:5000/artists/${id}`, fetcher, { suspense: true });
    
    if (error) return <div>failed to load</div>
    if (isLoading) return <div>loading...</div>

    const [artist, setArtist] = useState(data);

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
                trigger(artist);
                }}>
                    Update Artist
            </button>
        </div>
  );
}