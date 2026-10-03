import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import IconButton from '@mui/material/IconButton';
import ProfileAvatar from './User/ProfileAvatar';
import MenuItem from '@mui/material/MenuItem';
import Menu from '@mui/material/Menu';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';

import * as helpers from '../Data.Helper.Api';
import styles from './Nav.Component.Menu.module.css';

export default function NavMenu() {
  const [anchorEl, setAnchorEl] = useState(null);
  const [hasSession, setHasSession] = useState(helpers.HasSession());
  const [isAdmin, setIsAdmin] = useState(helpers.IsAdmin());
  const [userName, setUserName] = useState(helpers.GetSessionUser());
  const [currentUser, setCurrentUser] = useState(null);
  const [myArtists, setMyArtists] = useState([]);
  const navigate = useNavigate();


  useEffect(() => {
    let active = true;
    let authGeneration = 0;
    let avatarGeneration = 0;
    const refreshAvatar = async () => {
      const generation = ++avatarGeneration;
      const token = localStorage.getItem('mss-token');
      const isCurrent = () => active && generation === avatarGeneration && token === localStorage.getItem('mss-token');
      if (!helpers.HasSession()) { setCurrentUser(null); return; }
      try {
        const res = await helpers.GetCurrentUser();
        const data = res.ok ? await res.json() : null;
        if (isCurrent()) {
          setCurrentUser(data?.user || null);
          if (data?.user) {
            setUserName(data.user.username);
            setIsAdmin(helpers.IsAdmin());
          }
        }
      } catch {
        if (isCurrent()) setCurrentUser(null);
      }
    };
    const updateAuth = async () => {
      const generation = ++authGeneration;
      const token = localStorage.getItem('mss-token');
      setHasSession(helpers.HasSession());
      setIsAdmin(helpers.IsAdmin());
      setUserName(helpers.GetSessionUser());
      setCurrentUser(null);
      setMyArtists([]);
      setAnchorEl(null);
      refreshAvatar();
      if (!helpers.HasSession()) return;
      try {
        const res = await helpers.GetMyArtists();
        const data = res.ok ? await res.json() : null;
        if (active && generation === authGeneration && token === localStorage.getItem('mss-token')) {
          setMyArtists(data?.artists || []);
        }
      } catch { /* Keep the account menu usable if artist lookup fails. */ }
    };
    const onStorage = event => {
      if (!event.key || event.key.startsWith('mss-')) updateAuth();
    };
    updateAuth();
    window.addEventListener('mss-auth-change', updateAuth);
    window.addEventListener('storage', onStorage);
    window.addEventListener('mss-avatar-change', refreshAvatar);
    return () => {
      active = false;
      window.removeEventListener('mss-auth-change', updateAuth);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('mss-avatar-change', refreshAvatar);
    };
  }, []);

  const handleMenu = (e) => {
    setAnchorEl(e.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = async () => {
    await helpers.Logout();
    handleClose();
    navigate('/login');
  };

  const handleArtistClick = (artistId) => {
    handleClose();
    navigate(`/artists/${artistId}`);
  };

  if (hasSession) {

    return (
      <>
        <IconButton
          size="small"
          aria-label="account of current user"
          aria-controls="menu-appbar"
          aria-haspopup="true"
          aria-expanded={Boolean(anchorEl)}
          onClick={handleMenu}
          className={styles.profileIconButton}
        >
          <ProfileAvatar src={currentUser?.profile_picture} name={currentUser?.username || userName} sx={{ width: 32, height: 32, fontSize: '1rem' }} />
        </IconButton>
        <Menu
          id="menu-appbar"
          anchorEl={anchorEl}
          anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
          keepMounted
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          open={Boolean(anchorEl)}
          onClose={handleClose}
        >
          <MenuItem disabled>
            <Typography variant="body2" color="text.secondary">Logged in as: {userName}</Typography>
          </MenuItem>
          <Divider />

          <MenuItem onClick={() => { handleClose(); navigate('/account'); }}>
            <Typography variant="button" className={styles.menuItemButton}>Account Settings</Typography>
          </MenuItem>

          {isAdmin && (
            <MenuItem onClick={() => { handleClose(); navigate('/admin/dashboard'); }}>
              <Typography variant="button" className={styles.menuItemButton}>Admin Dashboard</Typography>
            </MenuItem>
          )}
          {isAdmin && (
            <MenuItem onClick={() => { handleClose(); navigate('/admin/settings'); }}>
              <Typography variant="button" className={styles.menuItemButton}>System Settings</Typography>
            </MenuItem>
          )}

          {myArtists.map((artist) => (
            <MenuItem key={artist.id} onClick={() => handleArtistClick(artist.id)}>
              <Typography variant="button" className={styles.menuItemButton}>
                {artist.name} Profile
              </Typography>
            </MenuItem>
          ))}

          <MenuItem onClick={handleLogout}>
            <Typography variant="button" className={styles.menuItemButton + ' ' + styles.logoutButton}>
              Logout
            </Typography>
          </MenuItem>
        </Menu>
      </>
    );
  }

  return <><Button color="inherit" href="/login">Login</Button><Button color="inherit" href="/register">Create account</Button></>;
}
