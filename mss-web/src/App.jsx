import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import './App.css'

import ArtistList from './components/Artist/Artist.Component.List'
import CreateArtist from './components/Artist/Artist.Component.Create'
import ArtistDetail from './components/Artist/Artist.Component.Detail'
import ArtistUpdate from './components/Artist/Artist.Component.Update'
import CreateUser from './components/User/User.Component.Create'

// 1. Define page components
const Home = () => (
  <div>
    <h1>Welcome to Midnight Sound Syndicate</h1>
  </div>
);

// 3. Render the Provider
export default function App() {
  return (
    <BrowserRouter>
      {/* Navigation */}
      <div>
        <nav>
          <span style={{paddingRight: '10px',fontWeight: 'bold'}}>[ MSS ]</span>
          <Link to="/">Home</Link> |{" "} 
          <Link to="/artists">Artists</Link> |{" "} 
          <Link to="/artists/create">Create Artist</Link> |{" "} 
          <Link to="/users/create">Create User</Link>
        </nav>
      </div>
     
      <br /><br />
      {/* Routes */}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/artists" element={<ArtistList />} />
        <Route path="/artists/:id" element={<ArtistDetail />} />
        <Route path="/artists/create" element={<CreateArtist />} />
        <Route path="/artists/:id/update" element={<ArtistUpdate />} />
        <Route path="/users/create" element={<CreateUser />} />
      </Routes>
    </BrowserRouter>
  )
}
