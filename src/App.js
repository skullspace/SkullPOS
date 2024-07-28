//import logo from './logo.svg';
import './App.css';
import React from 'react';
import { BrowserRouter as Router, Route, Routes as Switch } from 'react-router-dom';

//import Dashboard from './components/Dashboard/Dashboard';
//import Auth from './components/Auth/Auth';
import IMS from './components/ims/IMS';
import Home from './components/Home/Home';
//import Settings from './components/Settings/Settings';
//import POS from './components/POS/POS';

import HeaderComp from './components/Header/HeaderComp';
import FooterComp from './components/Footer/FooterComp';
import Login from './components/login/Login';
import Logout from './components/login/logout';

import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';

import Cookies from 'universal-cookie';

const darkTheme = createTheme({
    palette: {
        mode: 'dark',
    },
});

function App() {

    // if not on the login screen and no JWT token is stored in the local storage, redirect to the login screen
    const cookies = new Cookies();
    if (window.location.pathname !== '/login' && !cookies.get('jwtToken')) {
        window.location.href = '/login';
    }


    return (

        <ThemeProvider theme={darkTheme}>
            <CssBaseline />
            <HeaderComp />
            <Router>
                <Switch>
                    <Route path='/ims' element={<IMS />} />
                    <Route path='/' element={<Home />} />
                    <Route path='/login' element={<Login />} />
                    <Route path='/logout' element={<Logout />} />

                </Switch>
            </Router>
            <FooterComp />

        </ThemeProvider>

    );
}

export default App;
