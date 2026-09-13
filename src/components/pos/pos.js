/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Cart from "./cart";
import { ProcessingModal, ErrorModal, CashPaymentModal, SuccessModal } from "../common/Modals/TransactionModals";
import AlertNotification from "../common/Alert/Alert";
import { Box, Chip, InputAdornment, Stack, TextField } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import {
	useAppwrite,
	ACTIVE_EVENT_OK,
	ACTIVE_EVENT_UNAVAILABLE,
	SETTINGS_OK,
	SETTINGS_PENDING,
} from "../../utils/api";
import SalesReport from "./salesReport";
import TransactionsView from "./transactionsView";
import ManageItemsView from "./manageItemsView";
import MySalesView from "./mySalesView";
import Category from "./category";
import { formatCAD } from "../../utils/format";
import { useStripe } from "../../utils/stripe";
import createHandleCardPayment from "../../utils/handleCardPayment";
import createCheckout from "../../utils/checkout";
import createRetryCheckout from "../../utils/retryCheckout";
import createProcessBarcode from "../../utils/barcode";
import {
	addItemToCart as addItemToCartUtil,
	removeItemFromCart as removeItemFromCartUtil,
	clearCartState as clearCartStateUtil,
	isAlcoholCartItem,
} from "../../utils/cartUtils";
import { findGiftcardByUPC } from "../../utils/giftcard";
import { recordPaymentWithRetry, describeUnknownPaymentFailure } from "../../utils/splitPayment";
import { setTransactionStatus } from "../../utils/transactionStatus";
import { setItemEnabled } from "../../utils/itemVisibility";
import { parseDollarsToCents } from "../../utils/cashTender";
import { computeTotal } from "../../utils/cartTotal";
import { isWithinBarHours } from "../../utils/barHours";

// How often the active event is re-fetched. The realtime subscription on the Events collection
// below can't carry this on its own: that subscription is permission-gated exactly like the read
// was, so it never fires for the anonymous PIN session the register runs on, and a function
// execution can't be subscribed to at all. Without the poll, an admin toggling sellsAlcohol or
// moving the bar hours mid-event would never reach the till. Ticketing-ActiveEvent is a cheap,
// side-effect-free read, so polling it is fine.
const ACTIVE_EVENT_POLL_MS = 60000;

// State before the first lookup has answered. Deliberately NOT "ok with no event": until the
// server has actually spoken we don't know whether the bar is open, and pretending we do is the
// bug this whole path exists to prevent.
const ACTIVE_EVENT_PENDING = { status: "pending", event: null, error: null };

/**
 * Admin kill-switch states. UNKNOWN is not a synonym for OFF -- see readAlcoholOverride.
 * PENDING behaves like UNKNOWN (alcohol hidden, gate not authoritative) but is the expected
 * state for the first second of every boot, so it raises no alarm.
 */
export const ALCOHOL_OVERRIDE_ON = "on";
export const ALCOHOL_OVERRIDE_OFF = "off";
export const ALCOHOL_OVERRIDE_UNKNOWN = "unknown";
export const ALCOHOL_OVERRIDE_PENDING = "pending";

// Values in barData/config that mean "the kill switch is not engaged". Anything else that is
// actually present -- "true", or a typo nobody can parse -- engages it. A value we can't read
// must not be read as permission to sell.
const OVERRIDE_OFF_VALUES = new Set(["", "false", "0", "no", "off"]);

/**
 * Reads the admin alcohol kill switch (barData/config's "alcohol_override_disabled") into a
 * THREE-state answer.
 *
 * P1-13: this used to be `settings?.alcohol_override_disabled === "true"`. `settings` starts
 * null and stays null when refreshData's fetch fails (it swallows the error), so
 * `undefined === "true"` is false and an unreachable config read as "override off" =
 * ALCOHOL PERMITTED. That is the wrong direction for a compliance kill switch, and it sat two
 * lines above an event gate that was deliberately written to fail the other way.
 *
 * The distinction that matters: a config we successfully READ which simply has no
 * alcohol_override_disabled row is a real answer ("nobody ever turned it on" = off). A config
 * we could not read at all is not an answer, and must hide alcohol.
 *
 * @param {Object|null} settings - the key/value config map, or null if never loaded
 * @param {string} settingsStatus - SETTINGS_PENDING | SETTINGS_OK | SETTINGS_UNAVAILABLE
 * @returns {"on"|"off"|"unknown"|"pending"}
 */
export function readAlcoholOverride(settings, settingsStatus) {
	if (settingsStatus === SETTINGS_PENDING) return ALCOHOL_OVERRIDE_PENDING;
	if (settingsStatus !== SETTINGS_OK || !settings) return ALCOHOL_OVERRIDE_UNKNOWN;
	const raw = settings.alcohol_override_disabled;
	// Config read fine, the row isn't there: the switch was never set.
	if (raw === undefined || raw === null) return ALCOHOL_OVERRIDE_OFF;
	if (OVERRIDE_OFF_VALUES.has(String(raw).trim().toLowerCase())) return ALCOHOL_OVERRIDE_OFF;
	return ALCOHOL_OVERRIDE_ON;
}

/**
 * Resolves the alcohol gate into the two separate questions the UI needs answered:
 *
 *   allowed -- may alcohol be shown/sold right now? Fails CLOSED: unknown means hidden.
 *   known   -- is that answer authoritative enough to act on destructively? Only then may
 *              alcohol already sitting in a cart be pulled back out.
 *
 * Those have to be separate. The selling grid hiding alcohol on an unknown gate is a safe,
 * reversible precaution; emptying a customer's cart mid-sale because a single poll timed out
 * is not. An override we actually READ as ON is a local, authoritative signal, so it satisfies
 * both; an override we could not read is authoritative for neither.
 *
 * `unavailableReason` names which half we couldn't establish, so the banner can say something
 * true rather than always blaming the event service.
 *
 * @param {Object} params
 * @param {{status: string, event: Object|null}} params.activeEventState - fetchActiveEvent result
 * @param {"on"|"off"|"unknown"} params.alcoholOverride - admin kill switch, see readAlcoholOverride
 * @param {Date} params.now
 * @returns {{allowed: boolean, known: boolean, unavailable: boolean, unavailableReason: string|null}}
 */
export function resolveAlcoholGate({ activeEventState, alcoholOverride, now }) {
	const status = activeEventState?.status;
	const event = activeEventState?.event ?? null;

	const overrideOn = alcoholOverride === ALCOHOL_OVERRIDE_ON;
	// Anything that isn't an explicit on/off -- including an omitted argument -- is unknown.
	const overrideUnknown = !overrideOn && alcoholOverride !== ALCOHOL_OVERRIDE_OFF;

	// A Ticketing-ActiveEvent build that predates the sellsAlcohol/barOpenTime/barCloseTime
	// allowlist returns a perfectly valid 200 with those fields simply absent. isWithinBarHours
	// then reads undefined as false and alcohol stays hidden -- but the gate would call itself
	// KNOWN, arm the cart-stripping effect, and fire no banner. An event document with no
	// sellsAlcohol field at all is a server we can't get an alcohol answer out of, not a
	// "no alcohol tonight".
	const eventMissingAlcoholFields = status === ACTIVE_EVENT_OK && !!event && event.sellsAlcohol === undefined;

	let unavailableReason = null;
	if (status === ACTIVE_EVENT_UNAVAILABLE) unavailableReason = "event-lookup";
	else if (eventMissingAlcoholFields) unavailableReason = "event-fields";
	else if (overrideUnknown && alcoholOverride === ALCOHOL_OVERRIDE_UNKNOWN) unavailableReason = "override";

	return {
		allowed: !overrideOn && !overrideUnknown && isWithinBarHours(event, now),
		known: overrideOn || (!overrideUnknown && status === ACTIVE_EVENT_OK && !eventMissingAlcoholFields),
		unavailable: unavailableReason !== null,
		unavailableReason,
	};
}

/** Banner text for each way the gate can fail to establish an answer. */
const GATE_UNAVAILABLE_LABELS = {
	"event-lookup": "Alcohol gate unavailable -- can't reach the event service",
	"event-fields": "Alcohol gate unavailable -- the event service isn't reporting bar hours",
	override: "Alcohol gate unavailable -- can't read the alcohol override setting",
};


const POS = () => {
	const {
		client,
		databases,
		config,
		categories,
		items,
		discounts,
		refreshCategories,
		refreshItems,
		refreshDiscounts,
		refreshData,
		fetchActiveEvent,
		settings,
		settingsStatus,
		uniqueId,
		currentUser,
		functions,
		fetchTransactions,
		logout,
		pinMode,
		sessionError,
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
	const [openManageItems, setOpenManageItems] = useState(false);
	const [openMySales, setOpenMySales] = useState(false);
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

	// A split leg's card charge went through but recording it didn't. Real money moved against
	// a sale that has no leg for it.
	//
	// Dropping the panel is NOT enough on its own: the cart behind it is still fully populated
	// and Checkout goes live again, so the cashier who was just told "do NOT charge again" can
	// ring the identical cart a second time. Latch the whole till exactly the way an unconfirmed
	// single-card charge does -- cart cleared, ErrorModal up with Retry hidden (hideRetry reads
	// cardChargeUnconfirmed) -- and leave the transaction PENDING so it shows up in the
	// Transactions view to be reconciled rather than being cancelled out from under real money.
	const handleSplitUnconfirmedCharge = useCallback((unconfirmed) => {
		const { amount, paymentIntentId } = unconfirmed || {};
		setActiveSplit(null);
		clearCart();
		setTransactionInProgress(false);
		setCardChargeUnconfirmed(true);
		setCheckoutError(
			`Card was charged ${formatCAD(amount || 0)} on a split sale but the payment could not be saved. ` +
				`Do not charge again -- reconcile manually against payment ${paymentIntentId || "(unknown)"} ` +
				`in the Transactions view.`,
		);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const localHandleCancelStripePayment = useCallback(() => {
		// Scoped to THIS transaction: the ErrorModal's Close runs this for every failure,
		// cash and giftcard included, and stripe.js's intent refs outlive the sale they
		// were minted for -- unscoped, a cash-leg failure could ask Stripe to cancel the
		// PREVIOUS customer's already-succeeded intent.
		handleCancelStripePayment(transactionId.current);
		setTransactionInProgress(false);

		setTransactionStatus({
			functions,
			transactionId: transactionId.current,
			status: "cancelled",
		}).catch((err) => console.error("Failed to mark transaction cancelled", err));
	}, []);

	const disableItem = useCallback(
		(itemId, toEnable = false) => {
			// `field` is REQUIRED here (P1-31). Item-SetEnabled defaults an omitted field to
			// "enabled_menu", which gates the customer-facing menu boards -- but what this
			// register shows is gated on the OTHER flag (item.js checks `enabledPOS`, mapped
			// from `enabled_pos`). Omitting it meant the 86 gesture pulled the item from the
			// public menu and left it ringing up here, which is the opposite of what the
			// bartender long-pressing it is asking for.
			setItemEnabled({ functions, itemId, enabled: !!toEnable, field: "enabled_pos" }).catch((err) =>
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
	// menu display. Layered on top of the event-driven gate below (both must
	// allow alcohol for it to show), not a replacement for it.
	const [hideAlcohol, setHideAlcohol] = useState(false);

	// Event-driven alcohol gate: the active event (set via the admin app's Events screen)
	// says whether alcohol is being sold at all today and, if so, during what bar-hours
	// window. No active event, or outside that window, hides alcohol automatically --
	// re-checked every minute so it flips on/off at the boundary without a page reload.
	const [activeEventState, setActiveEventState] = useState(ACTIVE_EVENT_PENDING);
	const activeEvent = activeEventState.event;
	// Narrower than the alcohol gate's own `unavailable`: this one is specifically "we could
	// not find out which event is running", which is what a DJ voucher needs to know. An
	// unreadable alcohol override doesn't affect voucher scoping.
	const activeEventUnavailable = activeEventState.status === ACTIVE_EVENT_UNAVAILABLE;
	const [now, setNow] = useState(() => new Date());

	// A transient session-check failure (flaky venue WiFi, a timeout) -- see api.js's
	// checkSession. Unlike an actual auth failure, this does NOT log the cashier out; just
	// surface it as a dismissible banner instead of failing silently.
	useEffect(() => {
		if (sessionError) {
			setStripeAlert({ active: true, message: sessionError, type: "warning" });
		}
	}, [sessionError, setStripeAlert]);

	useEffect(() => {
		let cancelled = false;
		const load = () => {
			fetchActiveEvent().then((result) => {
				if (!cancelled) setActiveEventState(result);
			});
		};
		load();
		const id = setInterval(load, ACTIVE_EVENT_POLL_MS);
		return () => {
			cancelled = true;
			clearInterval(id);
		};
	}, [fetchActiveEvent]);

	useEffect(() => {
		const id = setInterval(() => setNow(new Date()), 60000);
		return () => clearInterval(id);
	}, []);

	// Admin-controlled kill switch (barData/config's "alcohol_override_disabled" row, set via
	// the admin app) -- when on, alcohol is hidden here regardless of the event/bar-hours gate
	// above, for a manual/emergency stop independent of any event configuration. Read through
	// readAlcoholOverride, which keeps "the admin didn't turn it on" apart from "we couldn't
	// read the config at all" -- the second used to silently mean alcohol permitted (P1-13).
	const alcoholOverride = useMemo(
		() => readAlcoholOverride(settings, settingsStatus),
		[settings, settingsStatus]
	);

	const {
		allowed: alcoholCurrentlyAllowed,
		known: alcoholGateKnown,
		unavailable: alcoholGateUnavailable,
		unavailableReason: alcoholGateUnavailableReason,
	} = useMemo(
		() => resolveAlcoholGate({ activeEventState, alcoholOverride, now }),
		[activeEventState, now, alcoholOverride]
	);

	// The gate failing is a real operational problem -- alcohol is hidden and every DJ voucher
	// is rejected -- and used to be visible only as a console.error on a device nobody looks at.
	// Fire on the transition into (and back out of) the failed state, not every poll.
	const activeEventErrorShownRef = useRef(null);
	useEffect(() => {
		if (alcoholGateUnavailable && activeEventErrorShownRef.current !== alcoholGateUnavailableReason) {
			activeEventErrorShownRef.current = alcoholGateUnavailableReason;
			const detail =
				alcoholGateUnavailableReason === "event-lookup"
					? activeEventState.error || "the active event could not be checked"
					: alcoholGateUnavailableReason === "event-fields"
						? "the event service returned an event with no bar-hours fields (Ticketing-ActiveEvent is out of date)"
						: "the alcohol override setting could not be read from config";
			setStripeAlert({
				active: true,
				message: `Alcohol gate unavailable -- ${detail}. Alcohol is hidden and DJ vouchers can't be validated until this clears.`,
				type: "error",
			});
		} else if (!alcoholGateUnavailable) {
			activeEventErrorShownRef.current = null;
		}
	}, [alcoholGateUnavailable, alcoholGateUnavailableReason, activeEventState.error, setStripeAlert]);

	// Keeps a live ref of the cart so the realtime subscription below (subscribed once, not
	// re-subscribed on every keystroke) can always check its CURRENT contents.
	const cartRef = useRef(cart);
	useEffect(() => {
		cartRef.current = cart;
	}, [cart]);

	// Set when an item/category change arrives while the cart is non-empty (so it was skipped
	// below) -- the cart-watching effect further down applies it as soon as the cart empties
	// out, instead of that update being silently lost until the next unrelated change.
	const pendingItemRefreshRef = useRef(false);

	// Realtime: admin-app edits (item/category changes, the alcohol override toggle) reach this
	// POS the moment they happen, via Appwrite's websocket Realtime API, instead of waiting on
	// the next refresh/reload. The alcohol-override/settings and active-event channels always
	// refresh immediately -- toggling visibility doesn't touch anything already in the cart.
	// Item/category data (price, name, etc.) only refreshes when the cart is EMPTY, so an
	// in-progress sale never has its prices change out from under it mid-transaction.
	useEffect(() => {
		if (!client) return;

		const channels = [
			`databases.${config.databases.data.id}.collections.${config.databases.data.collections.config}.documents`,
			`databases.${config.databases.bar.id}.collections.${config.databases.bar.collections.events}.documents`,
			`databases.${config.databases.bar.id}.collections.${config.databases.bar.collections.items}.documents`,
			`databases.${config.databases.bar.id}.collections.${config.databases.bar.collections.categories}.documents`,
		];

		const unsubscribe = client.subscribe(channels, (response) => {
			const channels = response.channels || [];
			const isConfigChange = channels.some((c) => c.includes(`.collections.${config.databases.data.collections.config}.`));
			const isEventChange = channels.some((c) => c.includes(`.collections.${config.databases.bar.collections.events}.`));
			const isItemOrCategoryChange = channels.some(
				(c) =>
					c.includes(`.collections.${config.databases.bar.collections.items}.`) ||
					c.includes(`.collections.${config.databases.bar.collections.categories}.`)
			);

			if (isConfigChange) {
				refreshData();
			}
			if (isEventChange) {
				fetchActiveEvent().then(setActiveEventState);
			}
			if (isItemOrCategoryChange) {
				if (cartRef.current.length === 0) {
					refreshItems();
					refreshCategories();
				} else {
					pendingItemRefreshRef.current = true;
				}
			}
		});

		return () => unsubscribe();
	}, [client, config, refreshData, fetchActiveEvent, refreshItems, refreshCategories]);

	// Applies a refresh that arrived mid-sale (see pendingItemRefreshRef above) the moment the
	// cart empties back out -- e.g. right after checkout completes, or the cart is cleared.
	useEffect(() => {
		if (cart.length === 0 && pendingItemRefreshRef.current) {
			pendingItemRefreshRef.current = false;
			refreshItems();
			refreshCategories();
		}
	}, [cart.length, refreshItems, refreshCategories]);

	// If alcohol sales become disallowed (the override switches on, or the active event's bar
	// hours end) while alcohol items are already sitting in the cart, pull them back out --
	// a sale can't complete with alcohol in it once alcohol isn't allowed to be sold.
	//
	// Only on a KNOWN gate, though. A failed or still-pending active-event lookup hides alcohol
	// from the grid (fail closed, cheap to undo) but must not reach into a cart that's already
	// being rung up: a single timed-out poll would otherwise silently gut a customer's order
	// mid-sale and blame the bar hours for it.
	useEffect(() => {
		if (alcoholCurrentlyAllowed || !alcoholGateKnown) return;
		const remaining = cart.filter((cartItem) => !isAlcoholCartItem(cartItem, categories));
		if (remaining.length === cart.length) return;
		setCart(remaining);
		setStripeAlert({
			active: true,
			message: "Alcohol is no longer available for sale -- alcohol item(s) were removed from the cart.",
			type: "warning",
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [alcoholCurrentlyAllowed, alcoholGateKnown, categories]);


	// useCallback so this only gets a new identity when the cart or discount actually change --
	// it's a dependency of the terminal-display effect below, and a fresh function reference on
	// every render (e.g. from typing in the item search box) used to re-fire that effect for
	// unrelated renders.
	const calculateTotal = useCallback(() => {
		// The arithmetic itself lives in utils/cartTotal.js so it can be tested -- this
		// only pushes the result into state. See that file for the clamping rules.
		const { discount: discountAmount, total: newTotal } = computeTotal(cart, appliedDiscount);
		setDiscount(discountAmount);
		setTotal(newTotal);
	}, [cart, appliedDiscount]);

	// Barcode scanner keyboard capture
	const barcodeBuffer = useRef("");
	const barcodeTimer = useRef(null);

	const [giftcard, setGiftcard] = useState(null);
	// Set by checkout.js's giftcard branch (and retryCheckout.js) whenever the giftcard only
	// partially covers the sale -- {applied, remaining} in cents. Reading this back (instead of
	// discarding it) is what lets a retry after a failed card leg charge the actual remaining
	// amount instead of recomputing from the full cart total / the giftcard's stale balance.
	const [giftcardUsage, setGiftcardUsage] = useState(null);

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

				// A DJ voucher (a giftcard scoped to one event) has extra rules -- these are
				// just client-side pre-checks for a fast/clear message; Transaction-RecordPayment
				// re-validates all of this server-side at checkout regardless.
				if (found.eventId) {
					if (found.active === false) {
						setStripeAlert({ active: true, message: "This voucher has been revoked", type: "error" });
						return;
					}
					// Still refuse the voucher when we couldn't check the event -- the server
					// re-validates at checkout anyway -- but say which of the two it is, so the
					// bartender isn't told a perfectly good voucher is for the wrong night.
					if (!activeEvent) {
						setStripeAlert({
							active: true,
							message: activeEventUnavailable
								? "Can't check which event is running right now, so this voucher can't be validated -- try again in a moment"
								: "This voucher is only valid during its own event",
							type: "error",
						});
						return;
					}
					if (activeEvent.$id !== found.eventId) {
						setStripeAlert({
							active: true,
							message: "This voucher is only valid during its own event",
							type: "error",
						});
						return;
					}
					if (appliedDiscount) {
						setStripeAlert({
							active: true,
							message: "Clear the discount before using a DJ voucher",
							type: "error",
						});
						return;
					}
				}

				// set local giftcard state and switch payment method to giftcard
				setGiftcard(found);
				setPaymentMethod("giftcard");
				setStripeAlert({
					active: true,
					message: found.eventId
						? `DJ voucher loaded: $${(found.balance || 0) / 100}`
						: `Giftcard loaded: $${(found.balance || 0) / 100}`,
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
		[functions, setStripeAlert, activeEvent, activeEventUnavailable, appliedDiscount],
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
		if (discountOption && giftcard?.eventId) {
			setStripeAlert({
				active: true,
				message: "Clear the DJ voucher before applying a discount",
				type: "error",
			});
			return;
		}
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
		setGiftcardUsage(null);
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
				getCreatedBy: () => pinMode?.label || currentUser?.name || currentUser?.email || null,
				getBartenderId: () => pinMode?.bartenderId || null,
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
				setChangeDue,
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
			setChangeDue,
			handleCardPayment,
			giftcard,
			setGiftcard,
			clearCart,
			setCheckoutSuccess,
			setPaymentMethod,
			setGiftcardUsage,
		],
	);

	// Retries the payment leg for an already-created (pending) transaction after a failure --
	// see retryCheckout.js. Built the same injectable-deps way as checkout/handleCardPayment so
	// the giftcard-partial-then-failed-card path can be unit tested directly.
	const retryCheckout = useMemo(
		() =>
			createRetryCheckout({
				transactionIdRef: transactionId,
				getCardChargeUnconfirmed: () => cardChargeUnconfirmed,
				getPaymentMethod: () => paymentMethod,
				getGiftcard: () => giftcard,
				getGiftcardUsage: () => giftcardUsage,
				getTotal: () => total,
				functions,
				setGiftcard,
				setGiftcardUsage,
				setTransactionInProgress,
				setCheckoutError,
				setCheckoutSuccess,
				setPaymentMethod,
				setCashModalOpen,
				clearCart,
				handleCardPayment,
			}),
		[
			cardChargeUnconfirmed,
			paymentMethod,
			giftcard,
			giftcardUsage,
			total,
			functions,
			setTransactionInProgress,
			setCheckoutError,
			setCheckoutSuccess,
			setPaymentMethod,
			setCashModalOpen,
			clearCart,
			handleCardPayment,
		],
	);

	async function handleCashPayment() {
		const amountReceivedCents = parseDollarsToCents(amountReceived);
		if (amountReceivedCents < total) {
			setCheckoutError("Amount received is less than total");
			return;
		}
		const change = amountReceivedCents - total;

		// Close the modal and mark in-progress BEFORE the async call (not
		// after) -- both close the window for a double-submit, and neither
		// success nor the cleared cart is shown until the record is actually
		// confirmed. A cash sale that silently failed to save here would
		// still say "Checkout Successful" to the cashier while sitting
		// `pending` forever -- invisible to Sales Report, which only counts
		// `complete` transactions.
		setCashModalOpen(false);
		setTransactionInProgress(true);
		setCheckoutError("");

		try {
			// Retries on a transport failure. Safe because every attempt carries
			// the same `legId` for the server to dedupe on -- NOT because the
			// transaction's status would catch it: a full cash leg does flip the
			// sale out of "pending", but a leg on a part-paid sale would not, and
			// cash legs have no other uniqueness check at all. The dedupe lives in
			// Transaction-RecordPayment; see the DEPLOY COUPLING note on
			// recordPaymentWithRetry -- POS must not ship ahead of that function.
			const result = await recordPaymentWithRetry({
				functions,
				transactionId: transactionId.current,
				method: "cash",
				amount: total,
			});
			if (!result.ok) {
				throw new Error(result.error || "Failed to record cash payment");
			}

			setChangeDue(change);
			setCheckoutSuccess(true);
			clearCart();
			setPaymentMethod("stripe");
			setAmountReceived(0);
		} catch (err) {
			console.error("Failed to record cash payment", err);
			setCheckoutError(err.name === "RecordPaymentUnknownError" ? describeUnknownPaymentFailure(err) : err.message);
		} finally {
			setTransactionInProgress(false);
		}
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

	// Drop alcohol categories (and everything in them) when either the event-driven gate
	// says alcohol isn't currently being sold, or the staff-side hideAlcohol toggle is on.
	const displayCategories = useMemo(
		() => (!alcoholCurrentlyAllowed || hideAlcohol ? categories.filter((c) => !c.alcohol) : categories),
		[categories, hideAlcohol, alcoholCurrentlyAllowed]
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
					{/* Persistent, not just the dismissible alert: while this is up, alcohol is
					    hidden because we couldn't CHECK the event, not because the bar is shut --
					    the two used to be indistinguishable from behind the counter. */}
					{alcoholGateUnavailable && (
						<Chip
							label={
								GATE_UNAVAILABLE_LABELS[alcoholGateUnavailableReason] || "Alcohol gate unavailable"
							}
							color="error"
							size="small"
							sx={{ mb: 1 }}
						/>
					)}
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
				giftcardUsage={giftcardUsage}
				onClearGiftcard={() => {
					setGiftcard(null);
					setGiftcardUsage(null);
					setPaymentMethod("stripe");
					setStripeAlert({
						active: true,
						message: "Giftcard cleared",
						type: "info",
					});
				}}
				setOpenSalesReport={setOpenSalesReport}
				setOpenTransactions={setOpenTransactions}
				setOpenManageItems={!pinMode ? setOpenManageItems : undefined}
				setOpenMySales={pinMode?.bartenderId ? setOpenMySales : undefined}
				onLogout={logout}
				hideAlcohol={hideAlcohol}
				onToggleHideAlcohol={(checked) => setHideAlcohol(checked)}
				functions={functions}
				chargeCard={chargeCard}
				activeSplit={activeSplit}
				onSplitComplete={handleSplitComplete}
				onSplitCancel={handleSplitCancel}
				onSplitUnconfirmedCharge={handleSplitUnconfirmedCharge}
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
				total={total}
				formatCAD={formatCAD}
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
			<MySalesView
				open={openMySales}
				onClose={() => setOpenMySales(false)}
				functions={functions}
				bartenderId={pinMode?.bartenderId}
			/>
			<TransactionsView
				open={openTransactions}
				onClose={() => setOpenTransactions(false)}
				functions={functions}
				fetchTransactions={fetchTransactions}
				setStripeAlert={setStripeAlert}
				restricted={!!pinMode}
			/>
			<ManageItemsView
				open={openManageItems}
				onClose={() => setOpenManageItems(false)}
				items={items}
				functions={functions}
				onItemUpdated={refreshItems}
				setStripeAlert={setStripeAlert}
			/>
		</Box>
	);
};

export default POS;
