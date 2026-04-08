import HttpHelperClient from './Http.Helper.Client';

async function GetAllArtists(){
    const response = await HttpHelperClient('http://localhost:5000/artists', 'GET', {})
    return response;
}

async function GetArtistById(id){
    const response = await HttpHelperClient(`http://localhost:5000/artists/${id}`, 'GET', {})
    return response;
}

async function CreateArtist(data) {
    const response = await HttpHelperClient('http://localhost:5000/artists', 'POST', data)
    
    return response; 
}

async function DeleteArtist(id) {
    const response = await HttpHelperClient(`http://localhost:5000/artists/${id}`, 'DELETE', {})
    
    return response; 
}

async function UpdateArtist(data) {
    const response = await HttpHelperClient(`http://localhost:5000/artists/${data.id}`, 'PUT', data)
    
    return response;
}

async function CreateUser(data) {
    const response = await HttpHelperClient('http://localhost:5000/users', 'POST', data)
    
    return response; 
}

async function GetAllUsers(){
    const response = await HttpHelperClient('http://localhost:5000/users', 'GET', {})
    return response;
}

async function Authenticate(data){
    const response = await HttpHelperClient('http://localhost:5000/login', 'POST', data)
    return response;
}

function HasSession() {
    const hasSessionId = ('session-id' in localStorage) && (localStorage.getItem('session-id') !== undefined);
    const hasSessionUserId = ('session-userid' in localStorage) && (localStorage.getItem('session-userid') !== undefined);
    
    if (!hasSessionId) {
        console.log('No session id found')
        return false;
    }

    if (!hasSessionUserId) {
        console.log('No session user id found')
        return false;
    }

    return true;
}

function GetSessionId() {
    return localStorage.getItem('session-id');
}

function GetSessionUserId() {
    return localStorage.getItem('session-userid');
}

function ClearSession() {
    localStorage.removeItem('session-id');
    localStorage.removeItem('session-userid');
    
}

export { 
    GetAllArtists, GetArtistById, CreateArtist, DeleteArtist, 
    UpdateArtist, CreateUser, GetAllUsers, Authenticate, HasSession, 
    GetSessionId, GetSessionUserId, ClearSession
};

