import Axios from 'axios';

const sessionId = localStorage.getItem('session-id');
const sessionUserId = localStorage.getItem('session-userid');

export default function (url, method, data) {
    if (method === 'GET'){
        return fetch(url, {
            method: method, // Specify the method
            headers: { 
                'mss-sessionId': sessionId,
                'mss-sessionUserId': sessionUserId
            }
        });
    } else {
        return fetch(url, {
            method: method, // Specify the method
            headers: { 
                'mss-sessionid': sessionId,
                'mss-sessionUserId': sessionUserId
            }, // Set headers
            body: JSON.stringify(data) // Stringify body data
        });
    }

    
}

