import useSWRMutation from 'swr/mutation'

export default function DeleteArtist(props) {
    async function DeleteArtist(url) {
        await fetch(url, {
            method: 'DELETE'
        })
    }
     
    const { trigger } = useSWRMutation(`http://127.0.0.1:5000/artists/${props.id}`, DeleteArtist, {});
    return <button className='delete-artist-button' onClick={() => { trigger(props.id); props.onDelete(props.id); }}>Delete</button>
}