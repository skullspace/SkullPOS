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
import {
	recordPaymentWithRetry,
	describeUnknownPaymentFailure,
	describeCleanLegFailure,
	PAYMENT_METHOD_LABELS,
} from "../../utils/splitPayment";
import { setTransactionStatus } from "../../utils/transactionStatus";
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
	onUnconfirmedCharge,
}) => {
	const [legs, setLegs] = useState([]);
	const [remaining, setRemaining] = useState(totalAmount);
	const [activeMethod, setActiveMethod] = useState(null); // "cash" | "stripe" | "giftcard" | null
	const [amountInput, setAmountInput] = useState("");
	const [giftcardCode, setGiftcardCode] = useState("");
	const [foundGiftcard, setFoundGiftcard] = useState(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	// Set when a card charge went through but recording it as a leg did NOT -- real money
	// has moved with nothing on the sale to show for it. Mirrors pos.js's
	// `cardChargeUnconfirmed`: from here the panel offers no way to charge again (the old
	// behaviour left "Charge Card" enabled with the amount still filled in, and a second
	// tap minted a brand-new intent and took the money twice), and closing must NOT
	// cancel the transaction -- it isn't necessarily abandoned, it needs reconciling.
	const [cardChargeUnconfirmed, setCardChargeUnconfirmed] = useState(null);
	// Set when "Back to normal checkout" is pressed on a sale that already has recorded
	// legs -- those are real money already taken, so it takes an explicit confirmation
	// and cancels the transaction server-side (crediting giftcard legs back) instead of
	// quietly leaving it pending for the 04:00 sweep.
	const [confirmAbandon, setConfirmAbandon] = useState(false);

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

	/**
	 * Record one leg server-side. Returns true only if it was actually recorded --
	 * submitCard needs to know, because a false here after a successful charge means
	 * money moved that the sale has no record of.
	 */
	const applyLeg = async ({ method, amount, giftcardId, paymentIntentId }) => {
		setBusy(true);
		setError("");
		try {
			// Retries on a transport failure (network drop, timeout). Safe because every
			// attempt carries the same `legId` for the server to dedupe on -- NOT because
			// the transaction's own state would catch it: a part-paid split sale is still
			// "pending" with room left under payment_due, so a retry of an attempt that
			// already committed would otherwise be appended a second time. That dedupe
			// lives in Transaction-RecordPayment; see the DEPLOY COUPLING note on
			// recordPaymentWithRetry -- POS must not ship ahead of that function.
			const result = await recordPaymentWithRetry({ functions, transactionId, method, amount, giftcardId, paymentIntentId });
			if (!result.ok) {
				throw new Error(describeCleanLegFailure({ method, amount, error: result.error }));
			}

			setLegs((prev) => [...prev, { method, amount }]);
			setRemaining(result.remaining);
			closeMethod();

			if (result.remaining <= 0) {
				onComplete && onComplete();
			}
			return true;
		} catch (err) {
			console.error("Split payment leg failed", err);
			// RecordPaymentUnknownError means every retry failed to even reach
			// the server -- for a card/giftcard leg, money or balance may have
			// already moved with nothing recorded, so say so explicitly rather
			// than a generic error that invites a blind retry (double-charge).
			setError(err.name === "RecordPaymentUnknownError" ? describeUnknownPaymentFailure(err) : err.message || "Failed to record payment");
			return false;
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
		if (cardChargeUnconfirmed) return;
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

		let result;
		try {
			// transactionId is required: Stripe-CreatePaymentIntent stamps it into the
			// intent's metadata and Transaction-RecordPayment refuses any leg whose
			// intent doesn't carry it -- after the money is already captured.
			result = await chargeCard(amount, false, transactionId);
		} catch (err) {
			console.error("Card charge failed", err);
			// Nothing was captured -- the reader/intent failed. Safe to try again.
			setError(err.message || "Card charge failed");
			setBusy(false);
			return;
		}

		const recorded = await applyLeg({ method: "stripe", amount, paymentIntentId: result.id });
		if (!recorded) {
			// The card WAS charged and the leg was not recorded. Latch the panel so no
			// further charge can be started from here -- the previous behaviour left the
			// button enabled with the amount pre-filled under the error, and a second tap
			// minted a fresh PaymentIntent and charged the customer again.
			setCardChargeUnconfirmed({ amount, paymentIntentId: result.id });
		}
	};

	// "Back to normal checkout" on a sale with nothing taken yet is free -- with legs
	// already recorded it is not, so ask first.
	const requestAbandon = () => {
		if (legs.length === 0) {
			onCancel && onCancel();
			return;
		}
		setConfirmAbandon(true);
	};

	// Cancel the transaction server-side BEFORE dropping the panel. Transaction-SetStatus
	// reverses the recorded legs (a giftcard leg is credited straight back, a cash leg is
	// visibly voided); just hiding the panel left the sale pending with real money against
	// it until the 04:00 sweep cancelled it with no reversal at all.
	const confirmAbandonSale = async () => {
		setBusy(true);
		setError("");
		try {
			const result = await setTransactionStatus({ functions, transactionId, status: "cancelled" });
			if (!result || result.ok !== true) {
				throw new Error(result?.error || "Failed to cancel this sale");
			}
			setConfirmAbandon(false);
			onCancel && onCancel();
		} catch (err) {
			console.error("Failed to cancel split transaction", err);
			setError(
				`${err.message || "Failed to cancel this sale"} -- the legs already taken are still on this sale. ` +
					`Do not close it until it's cancelled or reconciled.`,
			);
		} finally {
			setBusy(false);
		}
	};

	const legSummary = legs.map((leg) => `${formatCAD(leg.amount)} ${PAYMENT_METHOD_LABELS[leg.method]}`).join(", ");

	// Both states take the panel over completely -- no method can be opened, and no
	// amount can be charged, until staff have dealt with what's on screen.
	const panelLocked = !!cardChargeUnconfirmed || confirmAbandon;

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

			{cardChargeUnconfirmed && (
				<Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
					<Typography variant="body2" color="error" sx={{ fontWeight: 700 }}>
						{`The card WAS charged ${formatCAD(cardChargeUnconfirmed.amount)} but the payment could not be saved on this sale. ` +
							`Do NOT charge again. Reconcile manually against payment ${cardChargeUnconfirmed.paymentIntentId} in the Transactions view.`}
					</Typography>
					{/* NOT onCancel. onCancel just drops the panel, which leaves the cart behind
					    it fully populated and the Checkout button live again -- a cashier who has
					    just been told "do NOT charge again" could ring the identical cart a second
					    time on card. onUnconfirmedCharge hands the unconfirmed charge up to the
					    register so it can latch the whole till the same way a single-card
					    unconfirmed charge does. The sale itself must stay PENDING either way: the
					    money moved, so it needs reconciling, not cancelling. */}
					<Button
						color="inherit"
						onClick={() =>
							onUnconfirmedCharge ? onUnconfirmedCharge(cardChargeUnconfirmed) : onCancel && onCancel()
						}
					>
						Close -- reconcile manually
					</Button>
				</Box>
			)}

			{confirmAbandon && (
				<Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
					<Typography variant="body2" color="error" sx={{ fontWeight: 700 }}>
						{`${legSummary} has already been taken on this sale. Going back cancels it: gift card legs are credited ` +
							`back and cash legs are voided, so any cash already in the drawer must be handed back.`}
					</Typography>
					<Box sx={{ display: "flex", gap: 1 }}>
						<Button onClick={() => setConfirmAbandon(false)} disabled={busy}>
							Keep this sale
						</Button>
						<Button color="error" variant="contained" onClick={confirmAbandonSale} disabled={busy} sx={{ flex: 1 }}>
							{busy ? <CircularProgress size={20} /> : "Cancel sale & go back"}
						</Button>
					</Box>
				</Box>
			)}

			{!panelLocked && activeMethod === null && (
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

			{!panelLocked && activeMethod === "cash" && (
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

			{!panelLocked && activeMethod === "giftcard" && (
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

			{!panelLocked && activeMethod === "stripe" && (
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

			{!panelLocked && activeMethod === null && (
				<Button color="inherit" size="small" onClick={requestAbandon} disabled={busy}>
					Back to normal checkout
				</Button>
			)}
		</Box>
	);
};

export default SplitPaymentPanel;
