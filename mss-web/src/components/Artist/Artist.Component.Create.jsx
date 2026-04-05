import { useState, useRef, useContext  } from 'react'
import UserDropdown from '../User/User.Helper.DropDown';
import { Artist } from './Artist.Class';



// Component Declaration
export default function CreateArtist() {
    var artist = new Artist();
    // Setup state object for Artist
    const [artistState, setArtistState] = useState(artist);

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
        switch (e.target.name) {
            case "name":
                artist.name = e.target.value
                break;
            case "location":
                artist.location = e.target.value
                break;
            case "description":
                artist.description = e.target.value
                break;
            case "youtube":
                artist.youtube = e.target.value
                break;
            case "twitch":
                artist.twitch = e.target.value
                break;
            case "mixcloud":
                artist.mixcloud = e.target.value
                break;
            case "soundcloud":
                artist.soundcloud = e.target.value
                break;
        }
    }

    // Setup the trigger event 
    const { trigger } = artist.Create();

    return (
        <div>
            <UserDropdown onUpdate={(userId) => {  selectedUserId = userId; artist.userId = userId; }} />
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