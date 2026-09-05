/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Cart from "./cart";
import { ProcessingModal, ErrorModal, CashPaymentModal, SuccessModal } from "../common/Modals/TransactionModals";
import AlertNotification from "../common/Alert/Alert";
import { Box, Chip, InputAdornment, Stack, TextField } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import { useAppwrite } from "../../utils/api";
import SalesReport from "./salesReport";
import TransactionsView from "./transactionsView";
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
import { findGiftcardByUPC } from "../../utils/giftcard";
import { recordPayment } from "../../utils/splitPayment";
import { setTransactionStatus } from "../../utils/transactionStatus";
import { setItemEnabled } from "../../utils/itemVisibility";


const POS = () => {
	const {
		databases,
		config,
		categories,
		items,
		discounts,
		refreshCategories,
		refreshItems,
		refreshDiscounts,
		refreshData,
		uniqueId,
		currentUser,
		functions,
		fetchTransactions,
		logout,
		pinMode,
	} = useAppwrite();

	const {
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

	// formatCAD is imported from shared utils

	const [cart, setCart] = useState([]);
	const [checkoutSuccess, setCheckoutSuccess] = useState(false);
	const [checkoutError, setCheckoutError] = useState("");
	// True only when a card charge succeeded but recording it failed even
	// after retries -- real money may have moved with nothing saved, so
	// the ErrorModal's Retry (which would re-charge the card) is hidden and
	// Close doesn't cancel the transaction (it might not actually be
	// abandoned) -- see handleCardPayment.js.
	const [cardChargeUnconfirmed, setCardChargeUnconfirmed] = useState(false);
	const [paymentMethod, setPaymentMethod] = useState("stripe");
	const [amountReceived, setAmountReceived] = useState(0);
	const [changeDue, setChangeDue] = useState(0);
	const [discount, setDiscount] = useState(0);
	const [total, setTotal] = useState(0);
	const [appliedDiscount, setAppliedDiscount] = useState(null);
	const transactionId = useRef(null);
	const [cashModalOpen, setCashModalOpen] = useState(false);
	const [openSalesReport, setOpenSalesReport] = useState(false);
	const [openTransactions, setOpenTransactions] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	// Non-null while a "Split Payment" checkout is in progress -- the
	// pending transaction already exists, and SplitPaymentPanel drives the
	// rest via recordPayment, one leg at a time.
	const [activeSplit, setActiveSplit] = useState(null);

	const handleSplitComplete = useCallback(() => {
		setActiveSplit(null);
		clearCart();
		setCheckoutSuccess(true);
		setPaymentMethod("stripe");
	}, []);

	const handleSplitCancel = useCallback(() => {
		setActiveSplit(null);
	}, []);

	const localHandleCancelStripePayment = useCallback(() => {
		handleCancelStripePayment();
		setTransactionInProgress(false);

		setTransactionStatus({
			functions,
			transactionId: transactionId.current,
			status: "cancelled",
		}).catch((err) => console.error("Failed to mark transaction cancelled", err));
	}, []);

	const disableItem = useCallback(
		(itemId, toEnable = false) => {
			setItemEnabled({ functions, itemId, enabled: !!toEnable }).catch((err) =>
				console.error("Failed to update item enabled state", err),
			);
			let itemName = items.find((item) => item.$id === itemId)?.name || "Unknown Item";
			setStripeAlert({
				active: true,
				message: `Item ${toEnable ? "enabled" : "disabled"}: ${itemName}`,
				type: "info",
			});
		},
		[functions, items],
	);

	// Local, staff-side convenience: hide alcohol items/categories from this
	// POS's own selling grid (e.g. before bar service starts). Purely a view
	// filter on this device -- does not touch the database or the customer
	// menu display.
	const [hideAlcohol, setHideAlcohol] = useState(false);

	const retryCheckout = () => {
		setCheckoutError(false);
		if (!transactionId.current) {
			setCheckoutError("No transaction available to retry");
			return;
		}

		// A card that may have already been charged must never be
		// re-charged blindly -- this shouldn't be reachable since the
		// ErrorModal hides Retry in this state, but guard here too.
		if (cardChargeUnconfirmed) {
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

				try {
					const applyAmount = Math.min(parseInt(gift.balance) || 0, parseInt(total || 0));
					const result = await recordPayment({
						functions,
						transactionId: transactionId.current,
						method: "giftcard",
						amount: applyAmount,
						giftcardId: gift.$id,
					});
					if (!result.ok) throw new Error(result.error || "Failed to apply giftcard");

					setGiftcard && setGiftcard({ ...gift, balance: gift.balance - applyAmount });

					if (result.remaining <= 0) {
						setTransactionInProgress(false);
						setCheckoutSuccess(true);
						clearCart();
						setPaymentMethod("stripe");
						return;
					}

					// partial: charge remainder via card
					if (handleCardPayment) {
						await handleCardPayment(transactionId.current, true, result.remaining);
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
		let newTotal = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);
		if (appliedDiscount) {
			let discountAmount =
				appliedDiscount.type === "percent"
					? (newTotal * (appliedDiscount.amount || 0)) / 100
					: appliedDiscount.amount || 0;
			discountAmount = Math.min(parseInt(discountAmount) || 0, newTotal);
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
	const [, setGiftcardUsage] = useState(null);

	const handleGiftcard = useCallback(
		async (code) => {
			setStripeAlert({
				active: true,
				message: "Looking up giftcard...",
				type: "info",
			});

			try {
				const found = await findGiftcardByUPC({ functions, code });

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
		[functions, setStripeAlert],
	);

	const processBarcode = useMemo(
		() =>
			createProcessBarcode({
				getItems: () => items,
				addItemToCart,
				setStripeAlert,
				handleGiftcard,
			}),
		[items, addItemToCart, setStripeAlert, handleGiftcard],
	);
	useEffect(() => {
		function onKeyDown(e) {
			// make enter not do anything
			if (e.key === "Enter") {
				e.preventDefault();
			}

			// ignore when typing into inputs/textareas/contenteditable
			const active = document.activeElement;
			if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable)) {
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

	const selectDiscount = (discountOption) => {
		if (!discountOption || appliedDiscount?.$id === discountOption.$id) {
			setAppliedDiscount(null);
			setDiscount(0);
		} else {
			setAppliedDiscount(discountOption);
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
		setAppliedDiscount(reset.appliedDiscount);
		setDiscount(reset.discount);
		setCart(reset.cart);
		setGiftcard(null);
	}

	// Create handleCardPayment using the utility factory so UI logic stays thin
	const handleCardPayment = useMemo(
		() =>
			createHandleCardPayment({
				chargeCard,
				terminal,
				functions,
				setStripeAlert,
				setTransactionInProgress,
				setCheckoutError,
				setCheckoutSuccess,
				setCardChargeUnconfirmed,
				clearCart,
				setPaymentMethod,
				formatCAD,
				getTotal: () => total,
				getCart: () => cart,
			}),
		[
			chargeCard,
			terminal,
			functions,
			setStripeAlert,
			setTransactionInProgress,
			setCheckoutError,
			setCheckoutSuccess,
			setCardChargeUnconfirmed,
			clearCart,
			setPaymentMethod,
			formatCAD,
			total,
			cart,
		],
	);

	const checkout = useMemo(
		() =>
			createCheckout({
				databases,
				config,
				functions,
				uniqueId,
				getCreatedBy: () => currentUser?.name || currentUser?.email || null,
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
				onSplitStarted: (id, totalAmount) => setActiveSplit({ id, total: totalAmount }),
			}),
		[
			databases,
			config,
			functions,
			uniqueId,
			currentUser,
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
		],
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
		recordPayment({
			functions,
			transactionId: transactionId.current,
			method: "cash",
			amount: total,
		}).catch((err) => console.error("Failed to record cash payment", err));
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
								description: item.name + "\n\t\t(" + formatCAD(item.price) + "/ea)",
								quantity: item.quantity,
								amount: parseInt(item.price) * item.quantity,
							})),
							...(appliedDiscount
								? [
									{
										description:
											appliedDiscount.name +
											(appliedDiscount.type === "percent"
												? "\n\t\t(" + appliedDiscount.amount + "% off)"
												: ""),
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
	}, [cart, discount, appliedDiscount, calculateTotal, terminal, terminalReady, total]);

	useEffect(() => {
		refreshCategories();
		refreshItems();
		refreshDiscounts();
		refreshData();
	}, [categories.length, items.length, refreshCategories, refreshItems, refreshDiscounts, refreshData]);

	const filteredItems = useMemo(() => {
		const query = searchQuery.trim().toLowerCase();
		if (!query) return items;
		return items.filter((item) => item.name?.toLowerCase().includes(query));
	}, [items, searchQuery]);

	const cartQuantities = useMemo(() => {
		const map = {};
		cart.forEach((cartItem) => {
			map[cartItem.$id] = cartItem.quantity;
		});
		return map;
	}, [cart]);

	// When hideAlcohol is on, drop alcohol categories (and everything in
	// them) from this device's own selling grid entirely.
	const displayCategories = useMemo(
		() => (hideAlcohol ? categories.filter((c) => !c.alcohol) : categories),
		[categories, hideAlcohol]
	);

	const categoriesWithItems = useMemo(
		() =>
			displayCategories.filter((category) =>
				filteredItems.some(
					(item) =>
						item.categories === category.$id &&
						item.enabledPOS !== false
				)
			),
		[displayCategories, filteredItems]
	);

	const scrollToCategory = (categoryId) => {
		const el = document.getElementById(`category-${categoryId}`);
		if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
	};

	return (
		<Box sx={{ display: "flex", width: "100%", height: "100vh" }}>
			<Box
				sx={{
					flex: 1,
					minWidth: 0,
					display: "flex",
					flexDirection: "column",
					p: 2,
					maxHeight: "100%",
					overflowY: "auto",
				}}
			>
				<Box
					sx={{
						position: "sticky",
						top: 0,
						zIndex: 2,
						backgroundColor: "background.default",
						pb: 1,
					}}
				>
					<TextField
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						placeholder="Search items..."
						size="small"
						fullWidth
						sx={{ mb: categoriesWithItems.length > 1 ? 1.5 : 0 }}
						InputProps={{
							startAdornment: (
								<InputAdornment position="start">
									<SearchIcon fontSize="small" />
								</InputAdornment>
							),
						}}
					/>
					{categoriesWithItems.length > 1 && (
						<Stack
							direction="row"
							spacing={1}
							sx={{ overflowX: "auto" }}
						>
							{categoriesWithItems.map((category) => (
								<Chip
									key={category.$id}
									label={category.name}
									onClick={() => scrollToCategory(category.$id)}
									sx={{ flexShrink: 0 }}
								/>
							))}
						</Stack>
					)}
				</Box>
				{displayCategories.map((category) => (
					<Category
						key={category.$id}
						category={category}
						items={filteredItems}
						onAdd={addItemToCart}
						disableItem={disableItem}
						cartQuantities={cartQuantities}
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
				discounts={discounts}
				appliedDiscount={appliedDiscount}
				onSelectDiscount={selectDiscount}
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
				setOpenSalesReport={setOpenSalesReport}
				setOpenTransactions={setOpenTransactions}
				onLogout={logout}
				hideAlcohol={hideAlcohol}
				onToggleHideAlcohol={(checked) => setHideAlcohol(checked)}
				functions={functions}
				chargeCard={chargeCard}
				activeSplit={activeSplit}
				onSplitComplete={handleSplitComplete}
				onSplitCancel={handleSplitCancel}
			/>
			<ProcessingModal
				isProcessing={transactionInProgress}
				paymentMethod={paymentMethod}
				onCancel={stopTransactionInProgress}
			/>
			<ErrorModal
				isOpen={!!checkoutError && !transactionInProgress}
				errorMessage={checkoutError}
				isRetrying={transactionInProgress}
				hideRetry={cardChargeUnconfirmed}
				onRetry={retryCheckout}
				onClose={() => {
					// A possibly-already-charged transaction isn't necessarily
					// abandoned -- don't mark it cancelled, just close the
					// dialog and let staff find it (still "pending") in the
					// Transactions view to reconcile manually.
					if (!cardChargeUnconfirmed) {
						localHandleCancelStripePayment();
					}
					setCardChargeUnconfirmed(false);
					setCheckoutError(false);
				}}
			/>
			<CashPaymentModal
				isOpen={cashModalOpen && !transactionInProgress && !checkoutError}
				amountPaid={amountReceived}
				onAmountChange={setAmountReceived}
				onSubmit={handleCashPayment}
				onClose={() => setCashModalOpen(false)}
				isProcessing={transactionInProgress}
			/>
			<SuccessModal
				isOpen={checkoutSuccess && !transactionInProgress && !checkoutError && !cashModalOpen}
				changeAmount={changeDue}
				formatCAD={formatCAD}
				onClose={() => setCheckoutSuccess(false)}
				onClearCart={() => {
					setChangeDue(0);
					clearCart();
				}}
			/>
			<AlertNotification
				isOpen={stripeAlert.active}
				message={stripeAlert.message}
				severity={stripeAlert.type}
				onClose={() =>
					setStripeAlert({
						active: false,
						message: "",
						type: "info",
					})
				}
			/>
			<SalesReport
				open={openSalesReport}
				onClose={() => setOpenSalesReport(false)}
				restricted={!!pinMode}
			/>
			<TransactionsView
				open={openTransactions}
				onClose={() => setOpenTransactions(false)}
				functions={functions}
				fetchTransactions={fetchTransactions}
				setStripeAlert={setStripeAlert}
				restricted={!!pinMode}
			/>
		</Box>
	);
};

export default POS;
