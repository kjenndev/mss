import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route  } from 'react-router-dom';
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'

import './components/Auth/verificationToken';
import './index.css'
import { MediaPlayerProvider } from './components/Media/MediaPlayerProvider';
import MediaNavigation from './components/Media/MediaNavigation';
import App from './App.jsx'
import SiteFooter from './components/SiteFooter';
import RouteGuard from './RouteGuard.jsx'

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
import Register from './components/Auth/Register';
import VerifyEmail from './components/Auth/VerifyEmail';
import ResendVerification from './components/Auth/ResendVerification';
import LegalPage from './components/Auth/LegalPage';
import AdminEmail from './components/Admin/Admin.Email';
import UserProfile from './components/User/User.Component.Profile'


createRoot(document.getElementById('root')).render(
  <StrictMode>
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <BrowserRouter>
        <MediaNavigation><MediaPlayerProvider>
        <App />
        {/* Routes */}
        <Routes>
          <Route path="/" element={<Home key={window.location.pathname}/>} />
          <Route path="/about" element={<About key={window.location.pathname}/>} />
          <Route path="/artists" element={<ArtistList key={window.location.pathname} />} />
          <Route path="/artists/:id" element={<ArtistDetail key={window.location.pathname} />} />
          <Route path="/artists/create" element={<RouteGuard admin><CreateArtist /></RouteGuard>} />
          <Route path="/artists/:id/update" element={<RouteGuard><ArtistUpdate /></RouteGuard>} />
          <Route path="/events" element={<EventList key={window.location.pathname} />} />
          <Route path="/events/create" element={<RouteGuard createEvent><CreateEvent /></RouteGuard>} />
          <Route path="/events/:id" element={<EventDetail key={window.location.pathname} />} />
          <Route path="/events/:id/update" element={<RouteGuard><EventUpdate /></RouteGuard>} />
          <Route path="/users/create" element={<RouteGuard admin><CreateUser /></RouteGuard>} />
          <Route path="/register" element={<Register />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/resend-verification" element={<ResendVerification />} />
          <Route path="/terms" element={<LegalPage kind="terms" />} />
          <Route path="/privacy" element={<LegalPage kind="privacy" />} />
          <Route path="/admin/email" element={<RouteGuard admin><AdminEmail /></RouteGuard>} />
          <Route path="/login" element={<Login key={window.location.pathname} />} />
          <Route path="/admin/dashboard" element={<RouteGuard admin><AdminDashboard /></RouteGuard>} />
          <Route path="/admin/settings" element={<RouteGuard admin><AdminSettings /></RouteGuard>} />
          <Route path="/admin/about" element={<RouteGuard admin><AdminAboutEditor /></RouteGuard>} />
          <Route path="/account" element={<RouteGuard><UserProfile /></RouteGuard>} />
        </Routes>
        <SiteFooter />
        </MediaPlayerProvider></MediaNavigation>
      </BrowserRouter>
    </LocalizationProvider>
  </StrictMode>,
)
