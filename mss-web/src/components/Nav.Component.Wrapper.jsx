import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';

import NavMenu from './Nav.Component.Menu'

export default function NavWrapper () {
    return (
        <div>
          <Box sx={{ flexGrow: 1 }}>
            <AppBar position="static">
              <Toolbar>
                <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
                  Midnight Sound Syndicate
                </Typography>
                <Button color="inherit" href='/'>Home</Button>
                <Button color="inherit" href='/artists'>Artists</Button>
                <Button color="inherit" href='/'>Events</Button>
                <Button color="inherit" href='/'>Shop</Button>
                <NavMenu />
              </Toolbar>
            </AppBar>
          </Box>
        </div>
    )
}