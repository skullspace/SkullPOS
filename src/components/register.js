import React, { useState } from "react";
import { useAppwrite } from "../utils/api";
import {
    Box,
    Button,
    Input,
    Typography,
    FormControl,
    FormLabel,
} from "@mui/material";
import { useNavigate } from "react-router-dom";

const Register = () => {
    const { register } = useAppwrite(); // Assuming `register` is a method from useAppwrite
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");

    const navigate = useNavigate();

    const handleRegister = async (e) => {
        e.preventDefault();
        try {
            await register({ name, email, password }); // Adjust according to your API
            setError("");
            alert("Registration successful! Please login.");
            navigate("/login");
        } catch (err) {
            setError(err.message || "Registration failed");
        }
    };

    const goToLogin = () => {
        navigate("/login");
    };

    return (
        <Box
            sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                height: "100vh",
                padding: 2,
            }}
        >
            <Typography level="h4" component="h1" sx={{ mb: 2 }}>
                Register
            </Typography>
            <form
                onSubmit={handleRegister}
                style={{ width: "100%", maxWidth: 400 }}
            >
                <FormControl required>
                    <FormLabel>Name</FormLabel>
                    <Input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        sx={{ mb: 2 }}
                    />
                </FormControl>
                <FormControl required>
                    <FormLabel>Email</FormLabel>
                    <Input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        sx={{ mb: 2 }}
                    />
                </FormControl>
                <FormControl required>
                    <FormLabel>Password</FormLabel>
                    <Input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        sx={{ mb: 2 }}
                    />
                </FormControl>
                {error && (
                    <Typography level="body2" color="danger" sx={{ mb: 2 }}>
                        {error}
                    </Typography>
                )}
                <Button
                    type="submit"
                    variant="solid"
                    color="primary"
                    fullWidth
                    sx={{ mb: 1 }}
                >
                    Register
                </Button>
                <Button
                    type="button"
                    variant="outlined"
                    color="neutral"
                    fullWidth
                    onClick={goToLogin}
                >
                    Back to Login
                </Button>
            </form>
        </Box>
    );
};

export default Register;
