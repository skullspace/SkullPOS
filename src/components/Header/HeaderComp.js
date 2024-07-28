import * as React from 'react';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Toolbar from '@mui/material/Toolbar';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Menu from '@mui/material/Menu';
import Container from '@mui/material/Container';
import Avatar from '@mui/material/Avatar';
import Button from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';
import MenuItem from '@mui/material/MenuItem';

import { Link } from 'react-router-dom';


import api from '../../api';

import Cookies from 'universal-cookie';

import Logo from '../../Logo.js';

const pages = ['Dashboard', 'IMS', 'POS'];
const settings = ['Profile', 'Logout'];

const HeaderComp = () => {


    // get selected page from the URL
    var selectedPage = window.location.pathname.split('/')[1];
    if (selectedPage === '') { selectedPage = 'Dashboard'; }
    console.log(selectedPage);

    const cookies = new Cookies();

    const user = cookies.get('user');

    var avatar;

    if (cookies.get('user')) {
        avatar = <Avatar alt={user.first_name + ' ' + user.last_name} src="/static/images/avatar/2.jpg" />
    } else {
        avatar = <Avatar alt="u" src="/static/images/avatar/2.jpg" />
    }


    const [anchorElNav, setAnchorElNav] = React.useState(null);
    const [anchorElUser, setAnchorElUser] = React.useState(null);

    const handleOpenNavMenu = (event) => {
        setAnchorElNav(event.currentTarget);
    };
    const handleOpenUserMenu = (event) => {
        setAnchorElUser(event.currentTarget);
    };

    const handleCloseNavMenu = () => {
        setAnchorElNav(null);
    };

    const handleCloseUserMenu = () => {
        setAnchorElUser(null);
    };

    return (
        <AppBar position="static">
            <Container maxWidth="xl">
                <Toolbar disableGutters sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Logo  />
                        <Box sx={{ ml: 2 }}>
                            <Typography
                                variant="h5"
                                component="a"
                                href="/"
                                sx={{
                                    mr: 2,
                                    display: { xs: 'flex', md: 'flex' },
                                    fontFamily: 'monospace',
                                    fontWeight: 700,
                                    letterSpacing: '.3rem',
                                    color: 'inherit',
                                    textDecoration: 'none',
                                    lineHeight: '1',
                                }}
                            >
                                SKULLSPACE
                            </Typography>

                            <Typography
                                variant="h6"
                                component="a"
                                href="/"
                                sx={{
                                    mr: 2,
                                    display: { xs: 'flex', md: 'flex' },
                                    fontFamily: 'monospace',
                                    lineHeight: '1',
                                    color: 'inherit',
                                    textDecoration: 'none',
                                }}
                            >
                                {selectedPage}
                            </Typography>
                        </Box>
                        <Box sx={{ flexGrow: 1, display: { xs: 'flex', md: 'flex' } }}>
                            {pages.map((page) => (
                                <Button
                                    href={page}
                                    key={page}
                                    onClick={handleCloseNavMenu}
                                    sx={{ my: 2, color: 'white', display: 'block' }}
                                >
                                    {page}
                                </Button>
                            ))}
                        </Box>

                         <Box sx={{ flexGrow: 0 }}>
                            <Tooltip title="Open settings">
                                <IconButton onClick={handleOpenUserMenu} sx={{ p: 0 }}>
                                   {avatar}
                                </IconButton>
                            </Tooltip>
                            <Menu
                                sx={{ mt: '45px' }}
                                id="menu-appbar"
                                anchorEl={anchorElUser}
                                anchorOrigin={{
                                    vertical: 'top',
                                    horizontal: 'right',
                                }}
                                keepMounted
                                transformOrigin={{
                                    vertical: 'top',
                                    horizontal: 'right',
                                }}
                                open={Boolean(anchorElUser)}
                                onClose={handleCloseUserMenu}
                            >
                                {settings.map((setting) => (
                                    <MenuItem
                                    component='a' href={'/' + setting} key={setting} onClick={handleCloseUserMenu}>
                                        <Typography textAlign="center">{setting}</Typography>
                                    </MenuItem>
                                ))}
                            </Menu>
                        </Box>
                    </Toolbar>
            </Container>
        </AppBar>
    );
}

export default HeaderComp;
