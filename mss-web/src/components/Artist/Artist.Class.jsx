import useSWR from 'swr';
import useSWRMutation from 'swr/mutation'
import { mutate } from 'swr';

// Artist Class
export class Artist {
    constructor() {
        this.data = {
            id: -1,
            name: '',
            location: '',
            description: '',
            youtube: '',
            twitch: '',
            soundcloud: '',
            mixcloud: '',
            userid: -1
        }
    }

    // setup the fetcher for the SWR lib
    #fetcher = (...args) => fetch(...args).then(res => res.json());

    GetAllUsers() {
        return useSWR(`http://127.0.0.1:5000/artists`, this.#fetcher);
    }

    UpdateCache(id){
        mutate('http://127.0.0.1:5000/artists', data.filter(artist => artist.id !== id), false);
    }

    Create(){
        // manually handle the API call with this override
        async function CreateArtistHandler(url, artist) {
            await fetch(url, {
                method: 'POST',
                body: JSON.stringify(artist)
            });
        }

        // Setup the trigger event 
        return useSWRMutation('http://127.0.0.1:5000/artists', CreateArtistHandler, {});
    }
}