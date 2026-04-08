import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import IconButton from '@mui/material/IconButton';
import AccountCircle from '@mui/icons-material/AccountCircle';
import MenuItem from '@mui/material/MenuItem';
import Menu from '@mui/material/Menu';
import Button from '@mui/material/Button';

import * as helpers from '../Data.Helper.Api';

export default function NavMenu(){
    const [sessionId, setSessionId] = useState(helpers.GetSessionId());
    const [sessionUserId, setSessionUserId] = useState(helpers.GetSessionUserId());
    const [anchorEl, setAnchorEl] = useState(null);
    const [hasSession, setHasSession] = useState(helpers.HasSession());
    const navigate = useNavigate();
    
    const handleMenu = (e) => {
        setAnchorEl(e.currentTarget);
    };

    const handleClose = (e) => {
        setAnchorEl(null);
    };  
    
    if (hasSession) {
        return (
            <>
                <IconButton
                    size="large"
                    aria-label="account of current user"
                    aria-controls="menu-appbar"
                    aria-haspopup="true"
                onClick={handleMenu}
                color="inherit"
                >
                <AccountCircle />
                </IconButton>
                <Menu
                id="menu-appbar"
                anchorEl={anchorEl}
                anchorOrigin={{
                    vertical: 'top',
                    horizontal: 'right',
                }}
                keepMounted
                transformOrigin={{
                    vertical: 'top',
                    horizontal: 'right',
                }}
                open={Boolean(anchorEl)}
                onClose={handleClose}
                >
                <MenuItem name="profile">
                    <Button href={`/`}>Profile</Button>
                </MenuItem>
                <MenuItem name="create-artist">
                    <Button href="/artists/create">Create Artist</Button>
                </MenuItem>
                <MenuItem name="create-user">
                    <Button href="/users/create">Create User</Button>
                </MenuItem>
                <MenuItem name="log-out">
                    <Button href="/login">Logout</Button>
                </MenuItem>
                </Menu>
            </>
        )
    } else {
        return (
            <>
                <Button href="/login">Login</Button>
            </>
        )
    }
}