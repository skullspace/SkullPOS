import React, { useState } from 'react';
import { useAppwrite } from '../api'
import { Box, Button, Input, Typography, FormControl, FormLabel } from '@mui/joy';
import { useNavigate } from 'react-router-dom';

const Login = () => {
    const { login } = useAppwrite(); // Assuming `login` is a method from useAppwrite
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleLogin = async (e) => {
        e.preventDefault();
        try {
            await login(email, password); // Replace with your Appwrite login logic
            setError('');
            alert('Login successful!');
            navigate('/');
        } catch (err) {
            setError(err.message || 'Login failed');
        }
    };

    const navigate = useNavigate();

    const goToRegister = () => {
        navigate('/register');
    };

    return (
        <Box
            sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100vh',
                padding: 2,
            }}
        >
            <Typography level="h4" component="h1" sx={{ mb: 2 }}>
                Login
            </Typography>
            <form onSubmit={handleLogin} style={{ width: '100%', maxWidth: 400 }}>
                <FormControl required>
                    <FormLabel>
                        Email
                    </FormLabel>
                    <Input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        sx={{ mb: 2 }} />

                </FormControl>
                <FormControl required>
                    <FormLabel>
                        Password
                    </FormLabel>
                    <Input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        sx={{ mb: 2 }} />

                </FormControl>
                {error && (
                    <Typography level="body2" color="danger" sx={{ mb: 2 }}>
                        {error}
                    </Typography>
                )}
                <Button type="submit" variant="solid" color="primary" fullWidth sx={{ mb: 1 }}>
                    Login
                </Button>
                <Button type="button" variant="outlined" color="neutral" fullWidth onClick={goToRegister}>
                    Register
                </Button>

            </form>
        </Box>
    );
};

export default Login;
