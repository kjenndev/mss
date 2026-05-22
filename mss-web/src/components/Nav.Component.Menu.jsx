import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import IconButton from '@mui/material/IconButton';
import Avatar from '@mui/material/Avatar';
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
  const [myArtists, setMyArtists] = useState([]);
  const navigate = useNavigate();

  const getImageUrl = (path) => {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    return `http://localhost:4000${path}`;
  };

  const fetchArtists = async () => {
    if (helpers.HasSession()) {
      try {
        const res = await helpers.GetMyArtists();
        if (res.ok) {
          const data = await res.json();
          setMyArtists(data.artists || []);
        }
      } catch (err) {
        console.error('Error fetching artists:', err);
      }
    } else {
      setMyArtists([]);
    }
  };

  useEffect(() => {
    const updateAuth = () => {
      setHasSession(helpers.HasSession());
      setIsAdmin(helpers.IsAdmin());
      setUserName(helpers.GetSessionUser());
      fetchArtists(); // Fetch artists whenever auth changes
    };

    fetchArtists(); // Fetch artists on initial mount

    window.addEventListener('mss-auth-change', updateAuth);
    return () => window.removeEventListener('mss-auth-change', updateAuth);
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
    const primaryArtist = myArtists[0];

    return (
      <>
        <IconButton
          size="small"
          aria-label="account of current user"
          aria-controls="menu-appbar"
          aria-haspopup="true"
          onClick={handleMenu}
          className={styles.profileIconButton}
        >
          <Avatar 
            src={getImageUrl(primaryArtist?.profile_picture)} 
            className={styles.navAvatar}
          >
            {userName?.charAt(0).toUpperCase()}
          </Avatar>
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

  return <Button color="inherit" href="/login">Login</Button>;
}
