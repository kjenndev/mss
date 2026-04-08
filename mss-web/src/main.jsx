import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route  } from 'react-router-dom';

import './index.css'
import App from './App.jsx'

import ArtistList from './components/Artist/Artist.Component.List'
import CreateArtist from './components/Artist/Artist.Component.Create'
import ArtistDetail from './components/Artist/Artist.Component.Detail'
import ArtistUpdate from './components/Artist/Artist.Component.Update'
import CreateUser from './components/User/User.Component.Create'
import Login from './components/Auth/Auth.Component.Login'
import Home from './components/Home.Component.jsx'


createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
      {/* Routes */}
      <Routes>
        <Route path="/" element={<Home key={window.location.pathname}/>} />
        <Route path="/artists" element={<ArtistList key={window.location.pathname} />} />
        <Route path="/artists/:id" element={<ArtistDetail key={window.location.pathname} />} />
        <Route path="/artists/create" element={<CreateArtist key={window.location.pathname} />} />
        <Route path="/artists/:id/update" element={<ArtistUpdate key={window.location.pathname} />} />
        <Route path="/users/create" element={<CreateUser key={window.location.pathname} />} />
        <Route path="/login" element={<Login key={window.location.pathname} />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
