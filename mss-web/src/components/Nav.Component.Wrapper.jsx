import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Toolbar from '@mui/material/Toolbar';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';

import NavMenu from './Nav.Component.Menu'
import styles from './Nav.Component.Wrapper.module.css';

export default function NavWrapper () {
    return (
        <div>
          <Box sx={{ flexGrow: 1 }}>
            <AppBar position="static" className={styles.navAppBar}>
              <Toolbar>
                <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center' }}>
                  <a href="/" className={styles.logoLink}>
                    <img src="/msslogo.jpg" alt="Midnight Sound Syndicate" className={styles.logoImage} />
                    <Typography variant="h6" className={styles.logoText}>
                      Midnight Sound Syndicate
                    </Typography>
                  </a>
                </Box>
                <Box className={styles.navLinksContainer}>
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
