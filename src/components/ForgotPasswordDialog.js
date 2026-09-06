/**
 * ForgotPasswordDialog.js - Requests a password-recovery email for a staff
 * account (email/password login only -- PIN mode has no password to
 * recover). Completing the reset happens on RecoveryPage, at the link the
 * email contains.
 */

import React, { useState } from "react";
import { Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button, Typography } from "@mui/material";
import { useAppwrite } from "../utils/api";

const ForgotPasswordDialog = ({ open, onClose }) => {
	const { requestPasswordRecovery } = useAppwrite();
	const [email, setEmail] = useState("");
	const [status, setStatus] = useState("idle"); // idle | sending | sent | error

	const handleClose = () => {
		setEmail("");
		setStatus("idle");
		onClose();
	};

	const submit = async () => {
		if (!email.trim()) return;
		setStatus("sending");
		try {
			await requestPasswordRecovery(email.trim());
			setStatus("sent");
		} catch (err) {
			setStatus("error");
		}
	};

	return (
		<Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
			<DialogTitle>Reset Password</DialogTitle>
			<DialogContent>
				{status === "sent" ? (
					<Typography>If that email has an account, a reset link has been sent.</Typography>
				) : (
					<>
						<Typography sx={{ mb: 2 }}>Enter your account email and we'll send a reset link.</Typography>
						<TextField
							autoFocus
							fullWidth
							type="email"
							label="Email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							onKeyDown={(e) => e.key === "Enter" && submit()}
						/>
						{status === "error" && (
							<Typography color="error" variant="body2" sx={{ mt: 1 }}>
								Couldn't send that -- please try again.
							</Typography>
						)}
					</>
				)}
			</DialogContent>
			<DialogActions>
				<Button onClick={handleClose}>Close</Button>
				{status !== "sent" && (
					<Button variant="contained" disabled={!email.trim() || status === "sending"} onClick={submit}>
						{status === "sending" ? "Sending..." : "Send Reset Link"}
					</Button>
				)}
			</DialogActions>
		</Dialog>
	);
};

export default ForgotPasswordDialog;
