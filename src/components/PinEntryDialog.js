/**
 * PinEntryDialog.js - Quick-access PIN pad, opened from the Login page.
 *
 * A verified PIN signs the device into a restricted "cashier mode"
 * (see App.js's RequireAuth and utils/pin.js) -- no refunds, sales reports
 * capped to 24 hours -- without needing an email/password login.
 */

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogTitle, DialogContent, Box, Button, IconButton, Typography } from "@mui/material";
import BackspaceIcon from "@mui/icons-material/Backspace";
import { useAppwrite } from "../utils/api";

const PIN_LENGTH = 4;
const KEYPAD = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"];

const PinEntryDialog = ({ open, onClose }) => {
	const { loginWithPin } = useAppwrite();
	const navigate = useNavigate();
	const [pin, setPin] = useState("");
	const [error, setError] = useState("");
	const [submitting, setSubmitting] = useState(false);

	const reset = () => {
		setPin("");
		setError("");
		setSubmitting(false);
	};

	const handleClose = () => {
		reset();
		onClose();
	};

	const pressKey = (key) => {
		if (submitting) return;
		if (key === "back") {
			setError("");
			setPin((p) => p.slice(0, -1));
			return;
		}
		if (key === "" || pin.length >= PIN_LENGTH) return;
		setError("");
		setPin((p) => p + key);
	};

	useEffect(() => {
		if (pin.length < PIN_LENGTH || submitting) return;

		let cancelled = false;
		setSubmitting(true);

		loginWithPin(pin)
			.then(() => {
				if (cancelled) return;
				handleClose();
				navigate("/pos", { replace: true });
			})
			.catch((err) => {
				if (cancelled) return;
				setError(err.message || "Incorrect PIN");
				setPin("");
				setSubmitting(false);
			});

		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [pin]);

	return (
		<Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
			<DialogTitle>Quick Access PIN</DialogTitle>
			<DialogContent>
				<Box sx={{ display: "flex", justifyContent: "center", gap: 1.5, my: 2 }}>
					{Array.from({ length: PIN_LENGTH }).map((_, i) => (
						<Box
							key={i}
							sx={{
								width: 16,
								height: 16,
								borderRadius: "50%",
								border: "2px solid",
								borderColor: error ? "error.main" : "text.secondary",
								backgroundColor: i < pin.length ? (error ? "error.main" : "text.primary") : "transparent",
							}}
						/>
					))}
				</Box>
				<Typography color="error" align="center" variant="body2" sx={{ mb: 1, minHeight: "1.25em" }}>
					{error}
				</Typography>
				<Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1 }}>
					{KEYPAD.map((key, i) =>
						key === "back" ? (
							<IconButton key={i} onClick={() => pressKey("back")} disabled={submitting} size="large">
								<BackspaceIcon />
							</IconButton>
						) : key === "" ? (
							<Box key={i} />
						) : (
							<Button
								key={i}
								variant="outlined"
								size="large"
								onClick={() => pressKey(key)}
								disabled={submitting}
								sx={{ fontSize: "1.4rem", py: 1.5 }}
							>
								{key}
							</Button>
						),
					)}
				</Box>
			</DialogContent>
		</Dialog>
	);
};

export default PinEntryDialog;
