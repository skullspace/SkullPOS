/* eslint-disable no-unused-vars */
/* eslint-disable react-hooks/exhaustive-deps */
import React, {
	useState,
	useEffect,
	useCallback,
	useRef,
	useMemo,
} from "react";
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
import createHandleCardPayment from "../../utils/handleCardPayment";
import createCheckout from "../../utils/checkout";
import createProcessBarcode from "../../utils/barcode";
import {
	addItemToCart as addItemToCartUtil,
	removeItemFromCart as removeItemFromCartUtil,
	clearCartState as clearCartStateUtil,
} from "../../utils/cartUtils";
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
				console.log("Enabling item:", itemId);
				databases.updateDocument({
					databaseId: config.databases.bar.id,
					collectionId: config.databases.bar.collections.items,
					documentId: itemId,
					data: {
						shown: true,
					},
				});
			} else if (!toEnable) {
				console.log("Disabling item:", itemId);
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
		setCheckoutError(false);
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

		if (paymentMethod === "giftcard") {
			(async () => {
				const gift = giftcard;
				if (!gift) {
					setCheckoutError("No giftcard loaded");
					setTransactionInProgress(false);
					return;
				}

				const paymentDue = parseInt(total || 0);
				const giftBalance = parseInt(gift.balance || 0);
				const applied = Math.min(giftBalance, paymentDue);
				const remaining = paymentDue - applied;

				try {
					await databases.updateDocument({
						databaseId: config.databases.bar.id,
						collectionId:
							config.databases.bar.collections.transactions,
						documentId: transactionId.current,
						data: {
							giftcards: [gift.$id],
							giftcard_amount: applied,
							payment_due: remaining,
							payment_method:
								remaining > 0 ? "giftcard+stripe" : "giftcard",
							status: remaining > 0 ? "pending" : "complete",
						},
					});

					const newBalance = giftBalance - applied;
					await databases.updateDocument({
						databaseId: config.databases.bar.id,
						collectionId:
							config.databases.bar.collections.giftcards,
						documentId: gift.$id,
						data: { balance: newBalance },
					});

					setGiftcard &&
						setGiftcard({ ...gift, balance: newBalance });

					if (remaining <= 0) {
						setTransactionInProgress(false);
						setCheckoutSuccess(true);
						clearCart();
						setPaymentMethod("stripe");
						return;
					}

					// partial: charge remainder via card
					if (handleCardPayment) {
						await handleCardPayment(
							transactionId.current,
							true,
							remaining
						);
						return;
					}
				} catch (err) {
					console.error("Retry giftcard error", err);
					setCheckoutError("Failed to retry giftcard");
					setTransactionInProgress(false);
				}
			})();
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

	const [giftcard, setGiftcard] = useState(null);
	const [giftcardUsage, setGiftcardUsage] = useState(null);

	const handleGiftcard = useCallback(
		async (code) => {
			// basic giftcard lookup using configured collection if present
			setStripeAlert({
				active: true,
				message: "Looking up giftcard...",
				type: "info",
			});

			const collectionId =
				config &&
				config.databases &&
				config.databases.bar &&
				config.databases.bar.collections &&
				config.databases.bar.collections.giftcards;

			if (!collectionId) {
				setStripeAlert({
					active: true,
					message: "Giftcards collection not configured",
					type: "error",
				});
				return;
			}

			try {
				const res = await databases.listDocuments({
					databaseId: config.databases.bar.id,
					collectionId,
				});

				const docs = res.documents || [];
				const found = docs.find((d) => {
					const upc = d.UPC;
					if (!upc) return false;
					if (Array.isArray(upc)) return upc.includes(code);
					if (typeof upc === "string")
						return upc === code || upc.includes(code);
					return false;
				});

				if (!found) {
					setStripeAlert({
						active: true,
						message: `Giftcard not found: ${code}`,
						type: "error",
					});
					return;
				}

				// set local giftcard state and switch payment method to giftcard
				setGiftcard(found);
				setPaymentMethod("giftcard");
				setStripeAlert({
					active: true,
					message: `Giftcard loaded: $${(found.balance || 0) / 100}`,
					type: "success",
				});
			} catch (err) {
				console.error("error looking up giftcard", err);
				setStripeAlert({
					active: true,
					message: "Error looking up giftcard",
					type: "error",
				});
			}
		},
		[databases, config, setStripeAlert]
	);

	const processBarcode = useMemo(
		() =>
			createProcessBarcode({
				getItems: () => items,
				addItemToCart,
				setStripeAlert,
				handleGiftcard,
			}),
		[items, addItemToCart, setStripeAlert, handleGiftcard]
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
		setCart((prev) => addItemToCartUtil(prev, items, itemId));
	}

	function removeItemFromCart(itemId, all = false) {
		setCart((prev) => removeItemFromCartUtil(prev, itemId, all));
	}

	function clearCart() {
		// Use the util to get the canonical reset values, then apply them to state
		const reset = clearCartStateUtil();
		setMemberDiscountApplied(reset.member_discount_applied);
		setDiscount(reset.discount);
		setCart(reset.cart);
	}

	// Create handleCardPayment using the utility factory so UI logic stays thin
	const handleCardPayment = useMemo(
		() =>
			createHandleCardPayment({
				chargeCard,
				terminal,
				databases,
				config,
				setStripeAlert,
				setTransactionInProgress,
				setCheckoutError,
				setCheckoutSuccess,
				clearCart,
				setPaymentMethod,
				formatCAD,
				getTotal: () => total,
				getCart: () => cart,
			}),
		[
			chargeCard,
			terminal,
			databases,
			config,
			setStripeAlert,
			setTransactionInProgress,
			setCheckoutError,
			setCheckoutSuccess,
			clearCart,
			setPaymentMethod,
			formatCAD,
			total,
			cart,
		]
	);

	const checkout = useMemo(
		() =>
			createCheckout({
				databases,
				config,
				uniqueId,
				getCart: () => cart,
				getTotal: () => total,
				getDiscount: () => discount,
				getPaymentMethod: () => paymentMethod,
				getGiftcard: () => giftcard,
				setGiftcard,
				setGiftcardUsage,
				transactionIdRef: transactionId,
				setTransactionInProgress,
				setCheckoutError,
				setCashModalOpen,
				handleCardPayment,
				clearCart,
				setCheckoutSuccess,
				setPaymentMethod,
			}),
		[
			databases,
			config,
			uniqueId,
			cart,
			total,
			discount,
			paymentMethod,
			transactionId,
			setTransactionInProgress,
			setCheckoutError,
			setCashModalOpen,
			handleCardPayment,
			giftcard,
			setGiftcard,
			clearCart,
			setCheckoutSuccess,
			setPaymentMethod,
			setGiftcardUsage,
		]
	);

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
				onManualUPCEntry={processBarcode}
				giftcard={giftcard}
				onClearGiftcard={() => {
					setGiftcard(null);
					setPaymentMethod("stripe");
					setStripeAlert({
						active: true,
						message: "Giftcard cleared",
						type: "info",
					});
				}}
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
