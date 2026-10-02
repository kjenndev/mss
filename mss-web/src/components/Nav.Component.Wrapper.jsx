import { useState } from 'react';
import MenuIcon from '@mui/icons-material/Menu';
import IconButton from '@mui/material/IconButton';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Toolbar from '@mui/material/Toolbar';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';

import NavMenu from './Nav.Component.Menu'
import styles from './Nav.Component.Wrapper.module.css';

export default function NavWrapper () {
    const [open, setOpen] = useState(false);
    return (
        <div>
          <Box sx={{ flexGrow: 1 }}>
            <AppBar position="static" className={styles.navAppBar}>
              <Toolbar className={styles.toolbar}>
                <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', minWidth: 0 }}>
                  <a href="/" className={styles.logoLink}>
                    <img src="/msslogo.jpg" alt="Midnight Sound Syndicate" className={styles.logoImage} />
                    <Typography variant="h6" className={styles.logoText}>
                      Midnight Sound Syndicate
                    </Typography>
                  </a>
                </Box>
                <IconButton className={styles.menuToggle} color="inherit" aria-label="Toggle navigation" aria-expanded={open} aria-controls="primary-navigation" onClick={() => setOpen(!open)}><MenuIcon /></IconButton>
                <Box component="nav" id="primary-navigation" className={`${styles.navLinksContainer} ${open ? styles.navOpen : ''}`}>
                  <Button color="inherit" href='/' className={styles.navButton}>Home</Button>
                  <Button color="inherit" href='/about' className={styles.navButton}>About</Button>
                  <Button color="inherit" href='/artists' className={styles.navButton}>Artists</Button>
                  <Button color="inherit" href='/events' className={styles.navButton}>Events</Button>
                  <Button color="inherit" href='https://zowiemedia.net/zowieshop/' target="_blank" className={styles.navButton}>Shop</Button>
                  <NavMenu />
                </Box>
              </Toolbar>
            </AppBar>
          </Box>
        </div>
    )
}
