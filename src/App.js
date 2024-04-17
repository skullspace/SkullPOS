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
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';

const darkTheme = createTheme({
    palette: {
        mode: 'dark',
    },
});

function App() {
    return (

        <ThemeProvider theme={darkTheme}>
            <CssBaseline />
            <HeaderComp />
            <Router>
                <Switch>
                    <Route path='/ims' element={<IMS />} />
                    <Route path='/' element={<Home />} />
                </Switch>
            </Router>
            <FooterComp />

        </ThemeProvider>

    );
}

export default App;
