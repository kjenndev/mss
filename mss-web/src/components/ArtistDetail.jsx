import { useParams } from 'react-router-dom';
import useSWR from 'swr';

const fetcher = (...args) => fetch(...args).then(res => res.json());

export default function ArtistDetail() {
    const { id } = useParams();
    const { data, error, isLoading } = useSWR(`http://127.0.0.1:5000/artists/${id}`, fetcher);
    
    if (error) return <div>failed to load</div>
    if (isLoading) return <div>loading...</div>


    return (
        <div>
            <h2>Artist Detail</h2>
            {data && (
                <div>
                    <p><strong>Name:</strong> {data.name}</p>
                    <p><strong>Location:</strong> {data.location}</p>
                    <p><strong>Description:</strong> {data.description}</p>
                    <p><strong>Youtube:</strong> {data.youtube}</p>
                    <p><strong>Twitch:</strong> {data.twitch}</p>
                    <p><strong>Mixcloud:</strong> {data.mixcloud}</p>
                    <p><strong>Soundcloud:</strong> {data.soundcloud}</p>
                </div>
            )}

        </div>
    );
}