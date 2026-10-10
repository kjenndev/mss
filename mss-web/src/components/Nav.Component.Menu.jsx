import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import IconButton from '@mui/material/IconButton';
import ProfileAvatar from './User/ProfileAvatar';
import MenuItem from '@mui/material/MenuItem';
import Menu from '@mui/material/Menu';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import SettingsOutlined from '@mui/icons-material/SettingsOutlined';
import DashboardOutlined from '@mui/icons-material/DashboardOutlined';
import TuneOutlined from '@mui/icons-material/TuneOutlined';
import PersonOutline from '@mui/icons-material/PersonOutline';
import LogoutOutlined from '@mui/icons-material/LogoutOutlined';

import * as helpers from '../Data.Helper.Api';
import styles from './Nav.Component.Menu.module.css';

function AccountIdentity({ user, name }) {
  return <li role="presentation" className={styles.identity}>
    <ProfileAvatar src={user?.profile_picture} name={name} sx={{ width: 40, height: 40, flexShrink: 0 }} />
    <div className={styles.identityText}>
      <Typography component="p" className={styles.identityCaption}>Signed in as</Typography>
      <Typography component="p" className={styles.identityName}>{name}</Typography>
    </div>
  </li>;
}
AccountIdentity.muiSkipListHighlight = true;

export default function NavMenu({ guestClassName }) {
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
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          keepMounted
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          open={Boolean(anchorEl)}
          onClose={handleClose}
          slotProps={{
            paper: { className: styles.menuPaper },
            list: { 'aria-label': 'Account', className: styles.menuList },
          }}
        >
          <AccountIdentity user={currentUser} name={currentUser?.username || userName} />
          <Divider />

          <MenuItem className={styles.menuRow} onClick={() => { handleClose(); navigate('/account'); }}>
            <SettingsOutlined fontSize="small" /><Typography variant="body2" className={styles.menuItemButton}>Account Settings</Typography>
          </MenuItem>

          {isAdmin && <Divider />}
          {isAdmin && (
            <MenuItem className={styles.menuRow} onClick={() => { handleClose(); navigate('/admin/dashboard'); }}>
              <DashboardOutlined fontSize="small" /><Typography variant="body2" className={styles.menuItemButton}>Admin Dashboard</Typography>
            </MenuItem>
          )}
          {isAdmin && (
            <MenuItem className={styles.menuRow} onClick={() => { handleClose(); navigate('/admin/settings'); }}>
              <TuneOutlined fontSize="small" /><Typography variant="body2" className={styles.menuItemButton}>System Settings</Typography>
            </MenuItem>
          )}

          {isAdmin && <MenuItem className={styles.menuRow} onClick={() => { handleClose(); navigate('/admin/bookings'); }}><DashboardOutlined fontSize="small" /><Typography variant="body2" className={styles.menuItemButton}>Booking inbox</Typography></MenuItem>}

          {myArtists.length > 0 && <Divider />}
          {myArtists.map((artist) => (
            <MenuItem className={styles.menuRow} key={artist.id} onClick={() => handleArtistClick(artist.id)}>
              <PersonOutline fontSize="small" />
              <Typography variant="body2" className={styles.menuItemButton}>
                {artist.name} Profile
              </Typography>
            </MenuItem>
          ))}

          <Divider />
          <MenuItem className={`${styles.menuRow} ${styles.logoutButton}`} onClick={handleLogout}>
            <LogoutOutlined fontSize="small" />
            <Typography variant="body2" className={styles.menuItemButton + ' ' + styles.logoutButton}>
              Logout
            </Typography>
          </MenuItem>
        </Menu>
      </>
    );
  }

  return <div className={guestClassName}><Button color="inherit" href="/login">Login</Button><Button color="inherit" href="/register">Create account</Button></div>;
}
