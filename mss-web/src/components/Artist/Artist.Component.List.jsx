
import { Link } from 'react-router-dom';

import DeleteArtist from './Artist.Component.Delete';
import { Artist } from './Artist.Class';

// Component declaration
export default function ArtistList() {
  var artist = new Artist();
  // Call the API and get the all the artists
  const { data, error, isLoading } = artist.GetAllUsers();

  if (error) return <div>failed to load</div>
  if (isLoading) return <div>loading...</div> 

  // handles the delete callback
  function handleDelete(id) {
    // forces the SWR cache to update
    artist.UpdateCache(id);
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