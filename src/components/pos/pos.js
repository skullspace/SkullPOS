/* eslint-disable no-unused-vars */
/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useEffect, useCallback, useRef } from "react";
import Cart from "./cart";
import Modals from "./modals";
import {
	FormControl,
	InputLabel,
	Select,
	MenuItem,
	Alert,
	Collapse,
	Box,
	Button,
	Modal,
} from "@mui/material";
import { useAppwrite } from "../../utils/api";
import Item from "./item";
import Category from "./category";
import { formatCAD } from "../../utils/format";
import { useStripe } from "../../utils/stripe";
import { type } from "@testing-library/user-event/dist/type";

const POS = () => {
	const {
		client,
		databases,
		account,
		config,
		categories,
		items,
		refreshCategories,
		refreshItems,
		refreshData,
		settings,
		uniqueId,
	} = useAppwrite();

	const {
		stripeToken,
		terminals,
		selectedTerminal,
		setSelectedTerminal,
		chargeCard,
		terminalReady,
		terminal,
		initializeTerminal,
		stripeAlert,
		setStripeAlert,
		transactionInProgress,
		setTransactionInProgress,
		handleCancelStripePayment,
		stopTransactionInProgress,
	} = useStripe();

	const member_discount = settings ? settings.member_discount : 0;

	// formatCAD is imported from shared utils

	const [cart, setCart] = useState([]);
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);
	const [checkoutSuccess, setCheckoutSuccess] = useState(false);
	const [checkoutError, setCheckoutError] = useState("");
	const [paymentMethod, setPaymentMethod] = useState("stripe");
	const [amountReceived, setAmountReceived] = useState(0);
	const [changeDue, setChangeDue] = useState(0);
	const [discount, setDiscount] = useState(0);
	const [total, setTotal] = useState(0);
	const [member_discount_applied, setMemberDiscountApplied] = useState(false);
	const [checkoutLoading, setCheckoutLoading] = useState(false);
	const transactionId = useRef(null);
	const [cashModalOpen, setCashModalOpen] = useState(false);

	const localHandleCancelStripePayment = useCallback(() => {
		handleCancelStripePayment();
		setTransactionInProgress(false);

		databases.updateDocument({
			databaseId: config.databases.bar.id,
			collectionId: config.databases.bar.collections.transactions,
			documentId: transactionId.current,
			data: {
				status: "cancelled",
			},
		});
	}, []);

	const disableItem = useCallback(
		(itemId, toEnable = false) => {
			if (toEnable) {
				databases.updateDocument({
					databaseId: config.databases.bar.id,
					collectionId: config.databases.bar.collections.items,
					documentId: itemId,
					data: {
						shown: true,
					},
				});
			} else if (!toEnable) {
				databases.updateDocument({
					databaseId: config.databases.bar.id,
					collectionId: config.databases.bar.collections.items,
					documentId: itemId,
					data: {
						shown: false,
					},
				});
			}
			let itemName =
				items.find((item) => item.$id === itemId)?.name ||
				"Unknown Item";
			setStripeAlert({
				active: true,
				message: `Item ${
					toEnable ? "enabled" : "disabled"
				}: ${itemName}`,
				type: "info",
			});
		},
		[items]
	);

	const retryCheckout = () => {
		if (!transactionId.current) {
			setCheckoutError("No transaction available to retry");
			return;
		}

		// mark transaction as in progress for UI
		setTransactionInProgress(true);

		if (paymentMethod === "stripe") {
			// reuse existing transaction id and re-attempt charging the card
			handleCardPayment(transactionId.current, true);
			return;
		}

		if (paymentMethod === "cash") {
			// reopen cash modal so user can re-submit cash payment
			setCashModalOpen(true);
			setTransactionInProgress(false);
			return;
		}

		// fallback: clear in-progress state
		setTransactionInProgress(false);
	};

	const calculateTotal = () => {
		let newTotal = cart.reduce(
			(acc, item) => acc + item.price * item.quantity,
			0
		);
		if (member_discount_applied) {
			let discountAmount = (newTotal * member_discount) / 100;
			discountAmount = parseInt(discountAmount);
			setDiscount(discountAmount);
			newTotal -= discountAmount;
		} else {
			setDiscount(0);
		}
		setTotal(parseInt(newTotal));
	};

	// Barcode scanner keyboard capture
	const barcodeBuffer = useRef("");
	const barcodeTimer = useRef(null);

	const processBarcode = useCallback(
		(code) => {
			if (code.startsWith("75855")) {
				return;
			}
			if (!code) return;
			// try common fields where a barcode might be stored

			const found = items.find((i) => {
				return i.UPC.includes(code);
			});
			if (found) {
				addItemToCart(found.$id);
				setStripeAlert({
					active: true,
					message: `Scanned: ${found.name}`,
					type: "success",
				});
			} else {
				setStripeAlert({
					active: true,
					message: `Barcode not found: ${code}`,
					type: "error",
				});
			}
		},
		[items, addItemToCart, setStripeAlert]
	);

    

	useEffect(() => {
		function onKeyDown(e) {
			// ignore when typing into inputs/textareas/contenteditable
			const active = document.activeElement;
			if (
				active &&
				(active.tagName === "INPUT" ||
					active.tagName === "TEXTAREA" ||
					active.isContentEditable)
			) {
				return;
			}

			if (e.key === "Enter") {
				const barcode = barcodeBuffer.current;
				barcodeBuffer.current = "";
				if (barcode) processBarcode(barcode);
				return;
			}

			// only capture printable single-character keys
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

	const applyMemberDiscount = () => {
		if (member_discount_applied) {
			setMemberDiscountApplied(false);
			setDiscount(0);
		} else {
			setMemberDiscountApplied(true);
		}
	};

	function addItemToCart(itemId) {
		const item = items.find((item) => item.$id === itemId);
		const existingItem = cart.find((cartItem) => cartItem.$id === itemId);
		if (existingItem) {
			setCart(
				cart.map((cartItem) =>
					cartItem.$id === itemId
						? { ...cartItem, quantity: cartItem.quantity + 1 }
						: cartItem
				)
			);
		} else {
			setCart([...cart, { ...item, quantity: 1 }]);
		}
	}

	function removeItemFromCart(itemId, all = false) {
		const existingItem = cart.find((cartItem) => cartItem.$id === itemId);
		if (existingItem.quantity > 1 && !all) {
			setCart(
				cart.map((cartItem) =>
					cartItem.$id === itemId
						? { ...cartItem, quantity: cartItem.quantity - 1 }
						: cartItem
				)
			);
		} else {
			setCart(cart.filter((cartItem) => cartItem.$id !== itemId));
		}
	}

	function clearCart() {
		setMemberDiscountApplied(false);
		setDiscount(0);
		setCart([]);
	}

	async function checkout() {
		setTransactionInProgress(true);
		if (!paymentMethod) {
			setCheckoutError("Please select a payment method");
			return;
		}

		const transaction = {
			items: JSON.stringify(cart),
			payment_due: parseInt(total),
			payment_method: paymentMethod,
			tip: 0,
			discount: parseInt(discount),
			status: "pending",
			testing: true,
		};

		const document = await databases.createDocument(
			config.databases.bar.id,
			config.databases.bar.collections.transactions,
			uniqueId(),
			transaction
		);

		transactionId.current = document.$id;

		if (paymentMethod === "cash") {
			setTransactionInProgress(false);
			setCashModalOpen(true);
			return;
		}
		if (paymentMethod === "stripe") {
			handleCardPayment(document.$id);
		}
	}

	function handleCashPayment() {
		setTransactionInProgress(false);
		setCashModalOpen(false);
		// calculate change due
		const amountReceivedCents = Math.round(amountReceived * 100);
		if (amountReceivedCents < total) {
			setCheckoutError("Amount received is less than total");
			return;
		}
		const change = amountReceivedCents - total;
		setChangeDue(change);
		setCheckoutError("");
		setCheckoutSuccess(true);
		clearCart();
		setPaymentMethod("stripe");
		setAmountReceived(0);
		databases.updateDocument({
			databaseId: config.databases.bar.id,
			collectionId: config.databases.bar.collections.transactions,
			documentId: transactionId.current,
			data: {
				status: "complete",
			},
		});
	}

	function handleCardPayment(transaction, retrying = false) {
		if (!stripeToken) {
			setCheckoutError("Stripe terminal not connected");
			return;
		}
		// process card payment with stripe
		chargeCard(total, retrying)
			.then((result) => {
				setCheckoutError(false);
				databases.updateDocument({
					databaseId: config.databases.bar.id,
					collectionId: config.databases.bar.collections.transactions,
					documentId: transaction,
					data: {
						status: "complete",
						tip: parseInt(result.amount_details.tip.amount),
						stripe_id: result.id,
					},
				});
				setStripeAlert({
					active: true,
					message:
						"Payment Successful: " +
						formatCAD(result.amount) +
						" Total: " +
						formatCAD(total) +
						" + Tip: " +
						formatCAD(result.amount_details.tip.amount),
					type: "success",
				});
				setTransactionInProgress(false);
				setCheckoutSuccess(true);
				clearCart();
				setPaymentMethod("stripe");
			})
			.catch((error) => {
				setTransactionInProgress(false);
				if (error.decline_code) {
					return setCheckoutError(error.code + "\n" + error.message);
				}
				setCheckoutError(
					error.decline_code
						? error.code + "\n" + error.message
						: "Payment failed"
				);
			});
	}

	useEffect(() => {
		calculateTotal();
		if (terminal && terminalReady) {
			if (cart.length === 0) terminal.clearReaderDisplay();
			else {
				const updateTerm = terminal.setReaderDisplay({
					cart: {
						line_items: [
							...cart.map((item) => ({
								description:
									item.name +
									"\n\t\t(" +
									formatCAD(item.price) +
									"/ea)",
								quantity: item.quantity,
								amount: parseInt(item.price) * item.quantity,
							})),
							...(member_discount_applied
								? [
										{
											description:
												"Member Discount\n\t\t(" +
												member_discount +
												"% off)",
											quantity: 1,
											amount: -1 * parseInt(discount),
										},
								  ]
								: []),
						],
						total: parseInt(total),
						currency: "cad",
					},
					type: "cart",
				});
				updateTerm
					.then((res) => {
						if (res && res.error) {
							// reinitialize terminals if reader update failed
							initializeTerminal();
						}
					})
					.catch((err) => {
						// on promise rejection, reinitialize terminal
						initializeTerminal();
					});
			}
		}
	}, [cart, discount, calculateTotal, terminal, terminalReady, total]);

	useEffect(() => {
		refreshCategories();
		refreshItems();
		refreshData();
	}, [
		categories.length,
		items.length,
		refreshCategories,
		refreshItems,
		refreshData,
	]);

	return (
		<Box sx={{ display: "flex", height: "100vh" }}>
			<Box
				sx={{
					flex: 1,
					overflow: "wrap",
					display: "flex",
					flexWrap: "wrap",
					p: 2,
					maxHeight: "100%",
					overflowY: "auto",
					alignContent: "flex-start",
					alignItems: "flex-start",
				}}
			>
				{categories.map((category) => (
					<Category
						key={category.$id}
						category={category}
						items={items}
						onAdd={addItemToCart}
						disableItem={disableItem}
					/>
				))}
			</Box>

			<Box
				sx={{
					width: "2px",
					height: "100%",
					alignSelf: "center",
					backgroundColor: "divider",
					mx: "1px",
				}}
			/>

			<Cart
				cart={cart}
				formatCAD={formatCAD}
				member_discount_applied={member_discount_applied}
				applyMemberDiscount={applyMemberDiscount}
				clearCart={clearCart}
				removeItemFromCart={removeItemFromCart}
				onIncrement={addItemToCart}
				onDecrement={removeItemFromCart}
				total={total}
				terminalReady={terminalReady}
				paymentMethod={paymentMethod}
				setPaymentMethod={setPaymentMethod}
				checkout={checkout}
				checkoutError={checkoutError}
				setCheckoutError={setCheckoutError}
				cashModalOpen={cashModalOpen}
				setCashModalOpen={setCashModalOpen}
				amountReceived={amountReceived}
				setAmountReceived={setAmountReceived}
				handleCashPayment={handleCashPayment}
				checkoutSuccess={checkoutSuccess}
				setCheckoutSuccess={setCheckoutSuccess}
				changeDue={changeDue}
				setChangeDue={setChangeDue}
				transactionInProgress={transactionInProgress}
				terminals={terminals}
				selectedTerminal={selectedTerminal}
				setSelectedTerminal={setSelectedTerminal}
			/>
			<Modals
				cashModalOpen={cashModalOpen}
				setCashModalOpen={setCashModalOpen}
				checkoutSuccess={checkoutSuccess}
				setCheckoutSuccess={setCheckoutSuccess}
				checkoutError={checkoutError}
				setCheckoutError={setCheckoutError}
				onRetryCheckout={retryCheckout}
				transactionInProgress={transactionInProgress}
				amountReceived={amountReceived}
				setAmountReceived={setAmountReceived}
				handleCashPayment={handleCashPayment}
				changeDue={changeDue}
				formatCAD={formatCAD}
				handleCancelStripePayment={localHandleCancelStripePayment}
				stopTransactionInProgress={stopTransactionInProgress}
				paymentMethod={paymentMethod}
			/>
			<Collapse id="primaryAlert" in={stripeAlert.active}>
				<Alert
					variant="filled"
					open={stripeAlert.active}
					onClose={() =>
						setStripeAlert({
							active: false,
							message: "",
							type: "info",
						})
					}
					severity={stripeAlert.type}
				>
					{stripeAlert.message}
				</Alert>
			</Collapse>
		</Box>
	);
};

export default POS;
