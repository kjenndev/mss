import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route  } from 'react-router-dom';
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'

import './index.css'
import App from './App.jsx'

import ArtistList from './components/Artist/Artist.Component.List'
import CreateArtist from './components/Artist/Artist.Component.Create'
import ArtistDetail from './components/Artist/Artist.Component.Detail'
import ArtistUpdate from './components/Artist/Artist.Component.Update'
import EventList from './components/Event/Event.Component.List'
import CreateEvent from './components/Event/Event.Component.Create'
import EventDetail from './components/Event/Event.Component.Detail'
import EventUpdate from './components/Event/Event.Component.Update'
import CreateUser from './components/User/User.Component.Create'
import Login from './components/Auth/Auth.Component.Login'
import Home from './components/Home.Component.jsx'
import About from './components/About.Component.jsx'
import AdminDashboard from './components/Admin/Admin.Dashboard.Component'
import AdminSettings from './components/Admin/Admin.Settings.Component'
import AdminAboutEditor from './components/Admin/Admin.About.Component'
import UserProfile from './components/User/User.Component.Profile'


createRoot(document.getElementById('root')).render(
  <StrictMode>
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <BrowserRouter>
        <App />
        {/* Routes */}
        <Routes>
          <Route path="/" element={<Home key={window.location.pathname}/>} />
          <Route path="/about" element={<About key={window.location.pathname}/>} />
          <Route path="/artists" element={<ArtistList key={window.location.pathname} />} />
          <Route path="/artists/:id" element={<ArtistDetail key={window.location.pathname} />} />
          <Route path="/artists/create" element={<CreateArtist key={window.location.pathname} />} />
          <Route path="/artists/:id/update" element={<ArtistUpdate key={window.location.pathname} />} />
          <Route path="/events" element={<EventList key={window.location.pathname} />} />
          <Route path="/events/create" element={<CreateEvent key={window.location.pathname} />} />
          <Route path="/events/:id" element={<EventDetail key={window.location.pathname} />} />
          <Route path="/events/:id/update" element={<EventUpdate key={window.location.pathname} />} />
          <Route path="/users/create" element={<CreateUser key={window.location.pathname} />} />
          <Route path="/login" element={<Login key={window.location.pathname} />} />
          <Route path="/admin/dashboard" element={<AdminDashboard key={window.location.pathname} />} />
          <Route path="/admin/settings" element={<AdminSettings key={window.location.pathname} />} />
          <Route path="/admin/about" element={<AdminAboutEditor key={window.location.pathname} />} />
          <Route path="/account" element={<UserProfile key={window.location.pathname} />} />
        </Routes>
      </BrowserRouter>
    </LocalizationProvider>
  </StrictMode>,
)
