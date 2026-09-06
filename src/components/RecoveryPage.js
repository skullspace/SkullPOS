/**
 * RecoveryPage.js - Completes a password recovery.
 *
 * Reached only via the link in the email requestPasswordRecovery sends
 * (see ForgotPasswordDialog.js / utils/api.js) -- Appwrite appends
 * `userId` and `secret` query params to whatever URL was given when the
 * recovery was requested, and this page's only job is reading those back
 * and submitting a new password with them via completePasswordRecovery.
 * Public route (see App.js) -- there's no session yet at this point.
 */
import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Box, Button, Paper, TextField, Typography } from "@mui/material";
import { useAppwrite } from "../utils/api";

const RecoveryPage = () => {
	const { completePasswordRecovery } = useAppwrite();
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const userId = searchParams.get("userId");
	const secret = searchParams.get("secret");

	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [error, setError] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [done, setDone] = useState(false);

	const handleSubmit = async (e) => {
		e.preventDefault();
		if (password.length < 8) {
			setError("Password must be at least 8 characters");
			return;
		}
		if (password !== confirmPassword) {
			setError("Passwords don't match");
			return;
		}
		setSubmitting(true);
		setError("");
		try {
			await completePasswordRecovery(userId, secret, password);
			setDone(true);
		} catch (err) {
			setError(err.message || "That reset link is invalid or has expired -- request a new one from the login page.");
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", p: 2 }}>
			<Paper elevation={4} sx={{ width: "100%", maxWidth: 400, p: 4, borderRadius: 3 }}>
				<Typography variant="h4" align="center" sx={{ mb: 3 }}>
					Reset Password
				</Typography>

				{!userId || !secret ? (
					<Typography color="error">This reset link is missing information -- request a new one from the login page.</Typography>
				) : done ? (
					<>
						<Typography sx={{ mb: 2 }}>Your password has been reset.</Typography>
						<Button variant="contained" fullWidth onClick={() => navigate("/login")}>
							Back to Login
						</Button>
					</>
				) : (
					<form onSubmit={handleSubmit}>
						<TextField
							fullWidth
							required
							type="password"
							label="New Password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							sx={{ mb: 2 }}
						/>
						<TextField
							fullWidth
							required
							type="password"
							label="Confirm Password"
							value={confirmPassword}
							onChange={(e) => setConfirmPassword(e.target.value)}
							sx={{ mb: 2 }}
						/>
						{error && (
							<Typography color="error" variant="body2" sx={{ mb: 2 }}>
								{error}
							</Typography>
						)}
						<Button type="submit" variant="contained" fullWidth disabled={submitting}>
							{submitting ? "Resetting..." : "Reset Password"}
						</Button>
					</form>
				)}
			</Paper>
		</Box>
	);
};

export default RecoveryPage;
