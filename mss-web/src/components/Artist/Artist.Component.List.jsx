import useSWR from 'swr';
import { mutate } from 'swr';
import { Link } from 'react-router-dom';

import DeleteArtist from './Artist.Component.Delete';

// setup the fetcher for the SWR lib
const fetcher = (...args) => fetch(...args).then(res => res.json());

// Component declaration
export default function ArtistList() {
  // Call the API and get the all the artists
  const { data, error, isLoading } = useSWR(`http://127.0.0.1:5000/artists`, fetcher);

  if (error) return <div>failed to load</div>
  if (isLoading) return <div>loading...</div> 

  // handles the delete callback
  function handleDelete(id) {
    // forces the SWR cache to update
    mutate('http://127.0.0.1:5000/artists', data.filter(artist => artist.id !== id), false);
  }

    return (
        <div>
            All MSS Artists:
            <br /><br />
            <table>
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Location</th>
                        <th>Description</th>
                        <th>Youtube</th>
                        <th>Twitch</th>
                        <th>Mixcloud</th>
                        <th>Soundcloud</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
                     {data.map(artist => (
                        <tr key={artist.id}>
                            <td><Link to={`/artists/${artist.id}`}>{artist.name}</Link></td>
                            <td>{artist.location}</td>
                            <td>{artist.description}</td>
                            <td>{artist.youtube}</td>
                            <td>{artist.twitch}</td>
                            <td>{artist.mixcloud}</td>
                            <td>{artist.soundcloud}</td>
                            <td><DeleteArtist id={artist.id} onDelete={handleDelete} /></td>
                            <td><Link to={`/artists/${artist.id}/update`}>Update</Link></td>
                        </tr>
                    ))} 
                </tbody>
            </table>
           
        </div>
    );
}