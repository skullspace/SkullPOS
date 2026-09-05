/**
 * SplitPaymentPanel.js - Pay one sale across multiple payment legs
 *
 * Shown instead of PaymentMethodButtons/CheckoutButton once a "Split
 * Payment" checkout has created its pending transaction. Add legs (Cash /
 * Card / Gift Card) one at a time -- each is recorded server-side via
 * recordPayment (utils/splitPayment.js) as soon as it's confirmed -- until
 * the remaining balance hits zero. Two "Card" legs in a row is how two
 * different physical cards on one sale works; any mix of methods is fine.
 */

import React, { useState } from "react";
import { Box, Button, TextField, Typography, Chip, CircularProgress } from "@mui/material";
import MoneyIcon from "@mui/icons-material/AttachMoney";
import CreditCardIcon from "@mui/icons-material/CreditCard";
import CardGiftcardIcon from "@mui/icons-material/CardGiftcard";
import { formatCAD } from "../../utils/format";
import { recordPaymentWithRetry, describeUnknownPaymentFailure, PAYMENT_METHOD_LABELS } from "../../utils/splitPayment";
import { findGiftcardByUPC } from "../../utils/giftcard";

const centsFromInput = (value) => Math.round(parseFloat(value || "0") * 100);

const SplitPaymentPanel = ({
	transactionId,
	totalAmount,
	functions,
	chargeCard,
	terminalReady,
	onComplete,
	onCancel,
}) => {
	const [legs, setLegs] = useState([]);
	const [remaining, setRemaining] = useState(totalAmount);
	const [activeMethod, setActiveMethod] = useState(null); // "cash" | "stripe" | "giftcard" | null
	const [amountInput, setAmountInput] = useState("");
	const [giftcardCode, setGiftcardCode] = useState("");
	const [foundGiftcard, setFoundGiftcard] = useState(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");

	const openMethod = (method) => {
		setActiveMethod(method);
		setAmountInput((remaining / 100).toFixed(2));
		setGiftcardCode("");
		setFoundGiftcard(null);
		setError("");
	};

	const closeMethod = () => {
		setActiveMethod(null);
		setError("");
	};

	const applyLeg = async ({ method, amount, giftcardId, paymentIntentId }) => {
		setBusy(true);
		setError("");
		try {
			// Retries on a transport failure (network drop, timeout) -- safe
			// because Transaction-RecordPayment rejects a leg that's already
			// been applied (transaction no longer pending / would exceed the
			// remaining balance), so this can't double-apply a leg that
			// actually succeeded server-side on an earlier attempt.
			const result = await recordPaymentWithRetry({ functions, transactionId, method, amount, giftcardId, paymentIntentId });
			if (!result.ok) throw new Error(result.error || "Failed to record payment");

			setLegs((prev) => [...prev, { method, amount }]);
			setRemaining(result.remaining);
			closeMethod();

			if (result.remaining <= 0) {
				onComplete && onComplete();
			}
		} catch (err) {
			console.error("Split payment leg failed", err);
			// RecordPaymentUnknownError means every retry failed to even reach
			// the server -- for a card/giftcard leg, money or balance may have
			// already moved with nothing recorded, so say so explicitly rather
			// than a generic error that invites a blind retry (double-charge).
			setError(err.name === "RecordPaymentUnknownError" ? describeUnknownPaymentFailure(err) : err.message || "Failed to record payment");
		} finally {
			setBusy(false);
		}
	};

	const submitCash = () => {
		const amount = centsFromInput(amountInput);
		if (amount <= 0 || amount > remaining) {
			setError(`Enter an amount up to ${formatCAD(remaining)}`);
			return;
		}
		applyLeg({ method: "cash", amount });
	};

	const lookupGiftcard = async () => {
		if (!giftcardCode.trim()) return;
		setBusy(true);
		setError("");
		try {
			const found = await findGiftcardByUPC({ functions, code: giftcardCode.trim() });
			if (!found) {
				setError("Giftcard not found");
				return;
			}
			setFoundGiftcard(found);
			setAmountInput((Math.min(found.balance, remaining) / 100).toFixed(2));
		} catch (err) {
			console.error("Giftcard lookup failed", err);
			setError("Giftcard lookup failed");
		} finally {
			setBusy(false);
		}
	};

	const submitGiftcard = () => {
		const amount = centsFromInput(amountInput);
		if (amount <= 0 || amount > remaining) {
			setError(`Enter an amount up to ${formatCAD(remaining)}`);
			return;
		}
		if (amount > foundGiftcard.balance) {
			setError(`Exceeds giftcard balance of ${formatCAD(foundGiftcard.balance)}`);
			return;
		}
		applyLeg({ method: "giftcard", amount, giftcardId: foundGiftcard.$id });
	};

	const submitCard = async () => {
		const amount = centsFromInput(amountInput);
		if (amount <= 0 || amount > remaining) {
			setError(`Enter an amount up to ${formatCAD(remaining)}`);
			return;
		}
		if (!terminalReady) {
			setError("Terminal not ready");
			return;
		}
		setBusy(true);
		setError("");
		try {
			const result = await chargeCard(amount);
			await applyLeg({ method: "stripe", amount, paymentIntentId: result.id });
		} catch (err) {
			console.error("Card charge failed", err);
			setError(err.message || "Card charge failed");
			setBusy(false);
		}
	};

	return (
		<Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
			<Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
				<Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
					Split Payment
				</Typography>
				<Typography variant="h6" sx={{ fontWeight: 800 }}>
					{formatCAD(remaining)} left
				</Typography>
			</Box>

			{legs.length > 0 && (
				<Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
					{legs.map((leg, i) => (
						<Chip key={i} size="small" label={`${PAYMENT_METHOD_LABELS[leg.method]}: ${formatCAD(leg.amount)}`} />
					))}
				</Box>
			)}

			{error && (
				<Typography variant="body2" color="error">
					{error}
				</Typography>
			)}

			{activeMethod === null && (
				<Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1 }}>
					<Button startIcon={<MoneyIcon />} variant="outlined" onClick={() => openMethod("cash")} disabled={busy}>
						Cash
					</Button>
					<Button
						startIcon={<CreditCardIcon />}
						variant="outlined"
						onClick={() => openMethod("stripe")}
						disabled={busy || !terminalReady}
					>
						Card
					</Button>
					<Button
						startIcon={<CardGiftcardIcon />}
						variant="outlined"
						onClick={() => openMethod("giftcard")}
						disabled={busy}
					>
						Gift Card
					</Button>
				</Box>
			)}

			{activeMethod === "cash" && (
				<Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
					<TextField
						label="Cash amount"
						type="number"
						size="small"
						value={amountInput}
						onChange={(e) => setAmountInput(e.target.value)}
						autoFocus
					/>
					<Box sx={{ display: "flex", gap: 1 }}>
						<Button onClick={closeMethod} disabled={busy}>
							Cancel
						</Button>
						<Button variant="contained" onClick={submitCash} disabled={busy} sx={{ flex: 1 }}>
							{busy ? <CircularProgress size={20} /> : "Add Cash"}
						</Button>
					</Box>
				</Box>
			)}

			{activeMethod === "giftcard" && (
				<Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
					{!foundGiftcard ? (
						<>
							<TextField
								label="Gift card code"
								size="small"
								value={giftcardCode}
								onChange={(e) => setGiftcardCode(e.target.value)}
								autoFocus
							/>
							<Box sx={{ display: "flex", gap: 1 }}>
								<Button onClick={closeMethod} disabled={busy}>
									Cancel
								</Button>
								<Button variant="contained" onClick={lookupGiftcard} disabled={busy} sx={{ flex: 1 }}>
									{busy ? <CircularProgress size={20} /> : "Look Up"}
								</Button>
							</Box>
						</>
					) : (
						<>
							<Typography variant="body2">Balance: {formatCAD(foundGiftcard.balance)}</Typography>
							<TextField
								label="Amount to apply"
								type="number"
								size="small"
								value={amountInput}
								onChange={(e) => setAmountInput(e.target.value)}
								autoFocus
							/>
							<Box sx={{ display: "flex", gap: 1 }}>
								<Button onClick={closeMethod} disabled={busy}>
									Cancel
								</Button>
								<Button variant="contained" onClick={submitGiftcard} disabled={busy} sx={{ flex: 1 }}>
									{busy ? <CircularProgress size={20} /> : "Apply Gift Card"}
								</Button>
							</Box>
						</>
					)}
				</Box>
			)}

			{activeMethod === "stripe" && (
				<Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
					<TextField
						label="Card amount"
						type="number"
						size="small"
						value={amountInput}
						onChange={(e) => setAmountInput(e.target.value)}
						autoFocus
					/>
					<Box sx={{ display: "flex", gap: 1 }}>
						<Button onClick={closeMethod} disabled={busy}>
							Cancel
						</Button>
						<Button variant="contained" onClick={submitCard} disabled={busy} sx={{ flex: 1 }}>
							{busy ? <CircularProgress size={20} /> : "Charge Card"}
						</Button>
					</Box>
				</Box>
			)}

			{activeMethod === null && (
				<Button color="inherit" size="small" onClick={onCancel} disabled={busy}>
					Back to normal checkout
				</Button>
			)}
		</Box>
	);
};

export default SplitPaymentPanel;
