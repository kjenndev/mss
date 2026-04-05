import useSWRMutation from 'swr/mutation'

// component declaration
export default function DeleteArtist(props) {
    async function DeleteArtist(url) {
        await fetch(url, {
            method: 'DELETE'
        })
    }
    // Setup the trigger event
    const { trigger } = useSWRMutation(`http://127.0.0.1:5000/artists/${props.id}`, DeleteArtist, {});
    // Return a button that triggers the event and calls the passed props onDelete callback
    return <button className='delete-artist-button' onClick={() => { trigger(props.id); props.onDelete(props.id); }}>Delete</button>
}