/* eslint-disable react-hooks/exhaustive-deps */
/**
 * selfCheckout.js - Customer-facing self-checkout kiosk screen.
 *
 * Deliberately does NOT import components/pos/pos.js, cart.js,
 * salesReport.js, or transactionsView.js -- there is no code path here by
 * which refunds, transaction history, or reporting could ever be reached,
 * not just a hidden one. Payment is card-only (single card, no cash/
 * gift card/split), items add by tapping the grid or scanning a barcode,
 * and alcohol/age-restricted items never appear (see
 * selfCheckoutCategory.js).
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
	Box,
	Button,
	CircularProgress,
	FormControl,
	IconButton,
	InputLabel,
	MenuItem,
	Select,
	TextField,
	Typography,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import { useAppwrite } from "../../utils/api";
import { useStripe } from "../../utils/stripe";
import createCheckout from "../../utils/checkout";
import createHandleCardPayment from "../../utils/handleCardPayment";
import createProcessBarcode from "../../utils/barcode";
import { addItemToCart as addItemToCartUtil, removeItemFromCart as removeItemFromCartUtil } from "../../utils/cartUtils";
import { verifyPin } from "../../utils/pin";
import { formatCAD } from "../../utils/format";
import SelfCheckoutCategory from "./selfCheckoutCategory";

// After this long with no tap/scan, an abandoned cart is cleared so the
// next customer doesn't inherit a stranger's half-built order.
const IDLE_RESET_MS = 90 * 1000;
// After this long with no card presented, give up on the terminal wait
// rather than leaving a customer stuck at a frozen screen forever.
const PAYMENT_TIMEOUT_MS = 60 * 1000;
const TERMINAL_STORAGE_KEY = "skullpos_kiosk_terminal_id";

const SelfCheckout = () => {
	const { databases, config, categories, items, refreshCategories, refreshItems, uniqueId, functions, logout, pinMode } =
		useAppwrite();

	const {
		terminals,
		selectedTerminal,
		setSelectedTerminal,
		chargeCard,
		terminalReady,
		terminal,
		stopTransactionInProgress,
		transactionInProgress,
		setTransactionInProgress,
	} = useStripe();

	const [cart, setCart] = useState([]);
	const [checkoutSuccess, setCheckoutSuccess] = useState(false);
	const [checkoutError, setCheckoutError] = useState("");
	const [cardChargeUnconfirmed, setCardChargeUnconfirmed] = useState(false);
	const [staffPin, setStaffPin] = useState("");
	const [staffPinError, setStaffPinError] = useState("");
	const [staffPinChecking, setStaffPinChecking] = useState(false);
	const transactionId = useRef(null);

	const total = useMemo(() => cart.reduce((acc, item) => acc + item.price * item.quantity, 0), [cart]);

	function addItemToCart(itemId) {
		setCart((prev) => addItemToCartUtil(prev, items, itemId));
	}

	function removeItemFromCart(itemId, all = false) {
		setCart((prev) => removeItemFromCartUtil(prev, itemId, all));
	}

	function clearCart() {
		setCart([]);
	}

	const handleCardPayment = useMemo(
		() =>
			createHandleCardPayment({
				// A hard timeout on the terminal wait -- an unattended kiosk has
				// no cashier to notice a frozen "please tap your card" screen and
				// cancel it by hand, so give up on our own after PAYMENT_TIMEOUT_MS
				// and release the reader's collect-payment wait.
				chargeCard: (amount, retrying) =>
					Promise.race([
						chargeCard(amount, retrying),
						new Promise((_, reject) =>
							setTimeout(() => {
								stopTransactionInProgress();
								reject(new Error("Payment timed out -- no card was presented in time."));
							}, PAYMENT_TIMEOUT_MS),
						),
					]),
				terminal,
				functions,
				setStripeAlert: () => {},
				setTransactionInProgress,
				setCheckoutError,
				setCheckoutSuccess,
				setCardChargeUnconfirmed,
				clearCart,
				setPaymentMethod: () => {},
				formatCAD,
				getTotal: () => total,
				getCart: () => cart,
			}),
		[chargeCard, terminal, functions, setTransactionInProgress, total, cart],
	);

	const checkout = useMemo(
		() =>
			createCheckout({
				databases,
				config,
				functions,
				uniqueId,
				getCreatedBy: () => pinMode?.label || "Self-Checkout",
				getChannel: () => "self_checkout",
				getCart: () => cart,
				getTotal: () => total,
				getDiscount: () => 0,
				getPaymentMethod: () => "stripe",
				transactionIdRef: transactionId,
				setTransactionInProgress,
				setCheckoutError,
				handleCardPayment,
				clearCart,
				setCheckoutSuccess,
				setPaymentMethod: () => {},
			}),
		[databases, config, functions, uniqueId, pinMode, cart, total, setTransactionInProgress, handleCardPayment],
	);

	// Barcode scanner keyboard capture -- same HID-keyboard-emulation
	// handling the staff POS terminal uses (see components/pos/pos.js).
	const barcodeBuffer = useRef("");
	const barcodeTimer = useRef(null);

	const [scanMessage, setScanMessage] = useState("");

	const processBarcode = useMemo(
		() =>
			createProcessBarcode({
				getItems: () => items,
				addItemToCart,
				setStripeAlert: () => {},
				// No gift cards at self-checkout -- a scanned gift card code
				// shows a plain rejection instead of running a real lookup.
				handleGiftcard: () => setScanMessage("Gift cards aren't accepted here -- please see a cashier."),
				autoAddOnScan: true,
			}),
		[items],
	);

	useEffect(() => {
		if (!scanMessage) return;
		const t = setTimeout(() => setScanMessage(""), 3000);
		return () => clearTimeout(t);
	}, [scanMessage]);

	useEffect(() => {
		function onKeyDown(e) {
			if (e.key === "Enter") {
				e.preventDefault();
				const barcode = barcodeBuffer.current;
				barcodeBuffer.current = "";
				if (barcode) processBarcode(barcode);
				return;
			}
			if (e.key.length === 1) {
				barcodeBuffer.current += e.key;
				clearTimeout(barcodeTimer.current);
				barcodeTimer.current = setTimeout(() => {
					const barcode = barcodeBuffer.current;
					barcodeBuffer.current = "";
					if (barcode) processBarcode(barcode);
				}, 200);
			}
		}
		window.addEventListener("keydown", onKeyDown);
		return () => {
			window.removeEventListener("keydown", onKeyDown);
			clearTimeout(barcodeTimer.current);
		};
	}, [processBarcode]);

	useEffect(() => {
		refreshCategories();
		refreshItems();
	}, []);

	// Terminal reader selection has no hamburger-menu equivalent here --
	// fold it into a one-time device-setup step and persist the choice so
	// the kiosk reconnects to the same physical reader automatically after
	// a restart, unlike the staff session's per-reload reselection.
	useEffect(() => {
		if (selectedTerminal || terminals.length === 0) return;
		const saved = localStorage.getItem(TERMINAL_STORAGE_KEY);
		if (saved && terminals.some((r) => r.id === saved)) {
			setSelectedTerminal(saved);
		}
	}, [terminals, selectedTerminal]);

	function selectTerminal(id) {
		localStorage.setItem(TERMINAL_STORAGE_KEY, id);
		setSelectedTerminal(id);
	}

	// Idle-reset: an unattended kiosk has no cashier to notice an abandoned
	// cart or a customer who walked away after paying -- clear it after a
	// stretch of no activity so the next customer starts clean.
	const lastActivityRef = useRef(Date.now());
	useEffect(() => {
		function markActive() {
			lastActivityRef.current = Date.now();
		}
		window.addEventListener("pointerdown", markActive);
		window.addEventListener("keydown", markActive);
		return () => {
			window.removeEventListener("pointerdown", markActive);
			window.removeEventListener("keydown", markActive);
		};
	}, []);

	useEffect(() => {
		lastActivityRef.current = Date.now();
	}, [cart.length, checkoutSuccess]);

	useEffect(() => {
		const interval = setInterval(() => {
			const idleMs = Date.now() - lastActivityRef.current;
			if (idleMs < IDLE_RESET_MS) return;

			if (checkoutSuccess) {
				// Customer walked away without tapping "New Order" -- return to
				// idle for the next person.
				setCheckoutSuccess(false);
				clearCart();
			} else if (!transactionInProgress && !cardChargeUnconfirmed && cart.length > 0) {
				clearCart();
				if (checkoutError) setCheckoutError("");
			}
		}, 5000);
		return () => clearInterval(interval);
	}, [checkoutSuccess, transactionInProgress, cardChargeUnconfirmed, cart.length, checkoutError]);

	const cartQuantities = useMemo(() => {
		const m = {};
		cart.forEach((c) => (m[c.$id] = c.quantity));
		return m;
	}, [cart]);

	async function submitStaffPin() {
		setStaffPinChecking(true);
		setStaffPinError("");
		try {
			const result = await verifyPin({ functions, pin: staffPin });
			if (!result.ok) {
				setStaffPinError("Incorrect PIN");
				setStaffPin("");
				return;
			}
			// Any valid PIN (staff or kiosk) can clear a stuck kiosk -- this
			// isn't granting new privileges, just confirming a person who
			// knows the system is present to acknowledge the situation.
			setCardChargeUnconfirmed(false);
			setCheckoutError("");
			clearCart();
			setStaffPin("");
		} catch (err) {
			setStaffPinError("Couldn't verify PIN, try again");
		} finally {
			setStaffPinChecking(false);
		}
	}

	// --- Screen states ---------------------------------------------------

	if (!terminalReady) {
		return (
			<Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", gap: 3, p: 4 }}>
				<Typography variant="h5">Self-Checkout Setup</Typography>
				<Typography color="text.secondary">Select this kiosk's card reader to continue.</Typography>
				<FormControl sx={{ minWidth: 260 }}>
					<InputLabel id="kiosk-terminal-label">Card Reader</InputLabel>
					<Select
						labelId="kiosk-terminal-label"
						label="Card Reader"
						value={selectedTerminal || ""}
						onChange={(e) => selectTerminal(e.target.value)}
					>
						{terminals.map((r) => (
							<MenuItem key={r.id} value={r.id}>
								{r.label || r.id}
							</MenuItem>
						))}
					</Select>
				</FormControl>
				{terminals.length === 0 && <CircularProgress size={28} />}
				<Button onClick={logout}>Log out of self-checkout</Button>
			</Box>
		);
	}

	if (cardChargeUnconfirmed) {
		return (
			<Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", gap: 2, p: 4, textAlign: "center" }}>
				<Typography variant="h4" color="error">
					Payment couldn't be confirmed
				</Typography>
				<Typography color="text.secondary" sx={{ maxWidth: 480 }}>
					Something went wrong finishing your payment. Please don't try
					again here -- email{" "}
					<Box component="a" href="mailto:admin@skullspace.ca" sx={{ color: "inherit" }}>
						admin@skullspace.ca
					</Box>{" "}
					or message <strong>everettb</strong> on Discord and we'll sort it
					out.
				</Typography>
				<Box sx={{ display: "flex", gap: 1, alignItems: "flex-start", mt: 3 }}>
					<TextField
						label="Staff PIN to reset"
						type="password"
						size="small"
						value={staffPin}
						error={!!staffPinError}
						helperText={staffPinError}
						onChange={(e) => setStaffPin(e.target.value)}
						onKeyDown={(e) => e.key === "Enter" && submitStaffPin()}
					/>
					<Button variant="contained" disabled={staffPinChecking || !staffPin} onClick={submitStaffPin}>
						Reset
					</Button>
				</Box>
			</Box>
		);
	}

	if (transactionInProgress) {
		return (
			<Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", gap: 2 }}>
				<CircularProgress size={48} />
				<Typography variant="h6">Please tap, insert, or swipe your card...</Typography>
			</Box>
		);
	}

	if (checkoutSuccess) {
		return (
			<Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", gap: 2 }}>
				<Typography variant="h4">Thank you!</Typography>
				<Typography color="text.secondary">Please take your card and receipt.</Typography>
				<Button
					variant="contained"
					size="large"
					sx={{ mt: 3 }}
					onClick={() => {
						setCheckoutSuccess(false);
						clearCart();
					}}
				>
					New Order
				</Button>
			</Box>
		);
	}

	if (checkoutError) {
		return (
			<Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", gap: 2, p: 4, textAlign: "center" }}>
				<Typography variant="h5">Payment didn't go through</Typography>
				<Typography color="text.secondary">Your card wasn't charged. You can try again.</Typography>
				<Button variant="contained" sx={{ mt: 3 }} onClick={() => setCheckoutError("")}>
					Try Again
				</Button>
			</Box>
		);
	}

	return (
		<Box sx={{ display: "flex", height: "100vh" }}>
			<Box sx={{ flex: 1, overflow: "auto", py: 2 }}>
				<Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mx: 2.5, mb: 1 }}>
					<Typography variant="h5">Self-Checkout</Typography>
					<Button size="small" onClick={logout}>
						Log out
					</Button>
				</Box>
				{scanMessage && (
					<Typography sx={{ mx: 2.5, mb: 1 }} color="error">
						{scanMessage}
					</Typography>
				)}
				{categories.map((category) => (
					<SelfCheckoutCategory
						key={category.$id}
						category={category}
						items={items}
						onAdd={addItemToCart}
						cartQuantities={cartQuantities}
					/>
				))}
			</Box>

			<Box sx={{ width: 340, borderLeft: "1px solid", borderColor: "divider", display: "flex", flexDirection: "column", p: 2 }}>
				<Typography variant="h6" sx={{ mb: 1 }}>
					Your Order
				</Typography>
				<Box sx={{ flex: 1, overflow: "auto" }}>
					{cart.length === 0 && <Typography color="text.secondary">Tap an item or scan a barcode to begin.</Typography>}
					{cart.map((item) => (
						<Box key={item.$id} sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
							<Box>
								<Typography variant="body2">
									{item.quantity}x {item.name}
								</Typography>
								<Typography variant="caption" color="text.secondary">
									{formatCAD(item.price * item.quantity)}
								</Typography>
							</Box>
							<IconButton size="small" onClick={() => removeItemFromCart(item.$id, true)}>
								<DeleteIcon fontSize="small" />
							</IconButton>
						</Box>
					))}
				</Box>
				<Typography variant="h5" sx={{ display: "flex", justifyContent: "space-between", my: 2 }}>
					<span>Total</span>
					<span>{formatCAD(total)}</span>
				</Typography>
				<Button variant="contained" size="large" disabled={cart.length === 0} onClick={checkout}>
					Pay {formatCAD(total)}
				</Button>
			</Box>
		</Box>
	);
};

export default SelfCheckout;
