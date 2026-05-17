
import axios from 'axios';

async function test() {
  const API = 'http://localhost:4000/api';
  
  try {
    // 1. Log in as 'test' (User 2)
    const loginRes = await axios.post(`${API}/auth/login`, {
      username: 'test',
      password: 'test'
    });
    const token = loginRes.data.token;
    console.log('Login successful. Token:', token);
    
    // 2. Fetch owned artists
    const artistsRes = await axios.get(`${API}/users/me/artists`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Owned Artists:', JSON.stringify(artistsRes.data, null, 2));

  } catch (err) {
    console.error('Test failed:', err.response ? err.response.data : err.message);
  }
}

test();
