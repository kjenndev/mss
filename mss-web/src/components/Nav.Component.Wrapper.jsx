import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import MenuIcon from '@mui/icons-material/Menu';
import IconButton from '@mui/material/IconButton';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Toolbar from '@mui/material/Toolbar';
import Button from '@mui/material/Button';
import NavMenu from './Nav.Component.Menu';
import styles from './Nav.Component.Wrapper.module.css';

export default function NavWrapper() {
  const [open, setOpen] = useState(false);
  return (
    <AppBar position="static" className={styles.navAppBar}>
      <Toolbar className={`${styles.toolbar} ${open ? styles.expanded : ''}`}>
        <a href="/" className={styles.logoLink}>
          <img src="/msslogo.jpg" alt="Midnight Sound Syndicate" className={styles.logoImage} />
          <span className={styles.logoText}>Midnight Sound<span className={styles.wordmark}>SYNDICATE</span></span>
        </a>
        <Box component="nav" aria-label="Primary" id="primary-navigation" onClick={() => setOpen(false)} className={styles.navLinksContainer}>
          <Button color="inherit" component={NavLink} to="/" end className={styles.navButton}>Home</Button>
          <Button color="inherit" component={NavLink} to="/about" className={styles.navButton}>About</Button>
          <Button color="inherit" component={NavLink} to="/bookings" className={styles.navButton}>Bookings</Button>
          <Button color="inherit" component={NavLink} to="/artists" className={styles.navButton}>Artists</Button>
          <Button color="inherit" component={NavLink} to="/events" className={styles.navButton}>Events</Button>
          <Button color="inherit" href="https://zowiemedia.net/zowieshop/" target="_blank" rel="noopener noreferrer" className={styles.navButton}>Shop</Button>
        </Box>
        <NavMenu guestClassName={styles.guestLinks} />
        <IconButton className={styles.menuToggle} color="inherit" aria-label="Toggle navigation" aria-expanded={open} aria-controls="primary-navigation" onClick={() => setOpen(!open)}><MenuIcon /></IconButton>
      </Toolbar>
    </AppBar>
  );
}
