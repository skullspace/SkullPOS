/**
 * api.js - Appwrite backend integration and authentication management
 * 
 * This module provides:
 * - Appwrite client initialization and configuration
 * - User authentication (login, logout, quick-access PIN)
 * - Database operations for categories, items, and transactions
 * - Sales report generation and analytics
 * - Stripe connection token generation for payment processing
 * 
 * Backend: Appwrite Backend-as-a-Service (BaaS)
 * Database structure:
 *   - bar database: contains categories, items, transactions, inventory, events, giftcards
 *   - data database: contains configuration settings
 */

import { Client as Appwrite, Databases, Account, ID, Functions, Query, Teams } from "appwrite";

import { useMemo, useState, useEffect, useCallback } from "react";
import { verifyPin, getPinMode, setPinMode, clearPinMode } from "./pin";
import { isTestEnvironment } from "./environment";

const test = isTestEnvironment;

/**
 * Appwrite configuration
 * Contains endpoint URL, project ID, and database/collection IDs
 */
const config = {
	endpoint: "https://api.cloud.shotty.tech/v1",
	project: "68f2ac7b00002e7563a8",
	databases: {
		bar: {
			id: "67c9ffd9003d68236514",
			collections: {
				categories: "67c9ffdd0039c4e09c9a",
				items: "pos_items",
				itemsLegacy: "67c9ffe6001c17071bb7", // Items_old, migrated from on 2026-09-04
				events: "68e400210008d19bb5c9",
				inventory: "68e3ff08002deb5d5bf4",
				transactions: "68e4cd3500179ce661c6",
				giftcards: "giftcards",
				discounts: "discounts",
				ingredients: "ingredients",
			},
		},
		data: {
			id: "barData",
			collections: {
				config: "config",
			},
		},
	},
};

const PAGE_SIZE = 100;

/**
 * Ticketing-ActiveEvent. Its live $id is this literal slug, not a hex id.
 */
const ACTIVE_EVENT_FUNCTION_ID = "ticketing-active-event";

/** fetchActiveEvent result states -- see parseActiveEventExecution. */
export const ACTIVE_EVENT_OK = "ok";
export const ACTIVE_EVENT_UNAVAILABLE = "unavailable";

/**
 * `settingsStatus` states for the barData/config read (refreshData).
 *
 * "pending" -- the first read hasn't answered yet.
 * "ok"      -- `settings` reflects what the server actually has.
 * "unavailable" -- the read failed. `settings` is null (never loaded) or stale.
 */
export const SETTINGS_PENDING = "pending";
export const SETTINGS_OK = "ok";
export const SETTINGS_UNAVAILABLE = "unavailable";

function activeEventUnavailable(reason) {
	return { status: ACTIVE_EVENT_UNAVAILABLE, event: null, error: `Could not check the active event: ${reason}` };
}

/**
 * Turn a Ticketing-ActiveEvent execution into one of exactly two answers, which the caller
 * must keep apart:
 *
 *   { status: "ok", event: {...} | null }   -- the server answered. A null event means
 *                                              there genuinely is no event running tonight.
 *   { status: "unavailable", event: null, error } -- we do NOT know. The lookup failed.
 *
 * Collapsing the second into the first is exactly the bug this replaced (a 401 on the old
 * direct Events read read as "no event"), so every non-answer below is unavailable, never
 * an empty event. An execution that is queued/processing/failed carries an empty
 * responseBody, which would otherwise parse into a convincing-looking "no event".
 *
 * @param {Object} execution - Appwrite execution from functions.createExecution
 * @returns {{status: string, event: Object|null, error: string|null}}
 */
export function parseActiveEventExecution(execution) {
	if (!execution) return activeEventUnavailable("the function returned nothing");
	if (execution.status !== "completed") {
		return activeEventUnavailable(`the function did not run (status: ${execution.status || "unknown"})`);
	}
	if (execution.responseStatusCode !== 200) {
		return activeEventUnavailable(`the function returned HTTP ${execution.responseStatusCode}`);
	}

	let payload;
	try {
		payload = JSON.parse(execution.responseBody || "");
	} catch (err) {
		return activeEventUnavailable("the response could not be read");
	}

	// `event` is always present on a success, including as an explicit null. Its absence means
	// we got the function's own error body (or something else entirely), not an answer.
	if (!payload || typeof payload !== "object" || !("event" in payload)) {
		return activeEventUnavailable("the response was not in the expected shape");
	}

	return { status: ACTIVE_EVENT_OK, event: payload.event || null, error: null };
}

/**
 * Fetch every document in a collection matching the given queries,
 * paging through with a cursor instead of relying on a single limited
 * request (Appwrite defaults to a 25-document page when no limit is set,
 * and any single limit()  silently truncates once the collection grows
 * past it).
 *
 * @param {Databases} databases - Appwrite Databases instance
 * @param {string} databaseId
 * @param {string} collectionId
 * @param {Array} extraQueries - Additional Query filters (no limit/cursor)
 * @returns {Promise<Array<Object>>} All matching documents
 */
async function fetchAllDocuments(databases, databaseId, collectionId, extraQueries = []) {
	let allDocuments = [];
	let lastId = null;

	// eslint-disable-next-line no-constant-condition
	while (true) {
		const queries = [...extraQueries, Query.orderAsc("$id"), Query.limit(PAGE_SIZE)];
		if (lastId) queries.push(Query.cursorAfter(lastId));

		const page = await databases.listDocuments({
			databaseId,
			collectionId,
			queries,
		});

		const docs = page.documents || [];
		allDocuments = allDocuments.concat(docs);

		if (docs.length < PAGE_SIZE) break;
		lastId = docs[docs.length - 1].$id;
	}

	return allDocuments;
}

/**
 * Create and configure Appwrite client
 * @returns {Appwrite} Configured Appwrite client instance
 */
function createClient() {
	const client = new Appwrite();
	client.setEndpoint(config.endpoint).setProject(config.project);
	return client;
}

/**
 * Normalize a pos_items document to the field names the rest of the app expects (carried over
 * from the old Items_old schema), so the migration to pos_items didn't require touching every
 * component that reads an item.
 *
 * `sale_price` is the ONLY price the POS charges, on both the staff register and the
 * self-checkout kiosk -- `price` here is what cart totals, the reader display and every receipt
 * are computed from. pos_items also carries a `self_pricing` attribute, deliberately NOT read
 * here: nothing in the POS or in any of the 24 Appwrite functions reads it, its only writer is
 * SkullAdminApp's item form, and its only reader is the menu board, which aliases it to
 * `selfcheck_price` and DISPLAYS it. Setting it therefore changes what the board advertises
 * without changing what the till charges -- a Red Bull priced at 300 there and 400 here, with
 * nothing to warn the operator (P2-30). Mapping it onto `price` would close that gap from the
 * wrong end: it would silently re-price real sales off a field nobody thinks of as a POS price.
 * One price per item, and this is it.
 *
 * Hoisted out of useAppwrite (it closes over nothing) so this contract is directly testable.
 */
export function normalizePosItem(doc) {
	return {
		...doc,
		price: doc.sale_price,
		enabledPOS: doc.enabled_pos,
		alcohol: doc.contains_alcohol,
	};
}

/**
 * useAppwrite Hook - Main hook for Appwrite functionality
 * 
 * Provides:
 * - Authentication methods (login, logout, quick-access PIN)
 * - Database operations (CRUD for items, categories)
 * - Data fetching and caching
 * - Stripe token generation
 * 
 * @returns {Object} Object containing all Appwrite methods and state
 */
export function useAppwrite() {
	// State management
	const [categories, setCategories] = useState([]);
	const [items, setItems] = useState([]);
	const [discounts, setDiscounts] = useState([]);
	const [data, setData] = useState(null);
	// "pending" until the first barData/config read answers, then "ok" or "unavailable".
	// `data` alone can't carry this: it starts null and STAYS null when the read fails, so
	// every consumer of `settings` read a failed fetch as "the setting isn't set" -- which,
	// for the alcohol kill switch, means "override off" = alcohol permitted (P1-13). Callers
	// need to be able to tell "the admin hasn't turned it on" from "we couldn't ask".
	const [settingsStatus, setSettingsStatus] = useState(SETTINGS_PENDING);

	// Initialize Appwrite clients (memoized to prevent recreation)
	const client = useMemo(() => createClient(), []);
	const databases = useMemo(() => new Databases(client), [client]);
	const account = useMemo(() => new Account(client), [client]);
	const teams = useMemo(() => new Teams(client), [client]);

	/**
	 * Fetch all product categories from database
	 * Categories group items in the POS UI
	 */
	const refreshCategories = useCallback(async () => {
		try {
			const documents = await fetchAllDocuments(
				databases,
				config.databases.bar.id,
				config.databases.bar.collections.categories,
			);
			setCategories(documents);
		} catch (err) {
			console.error("error getting categories", err);
		}
	}, [databases]);

	/**
	 * Fetch all configured discounts (member discount, comps, promos, etc.)
	 * so the POS can offer more than a single hardcoded discount.
	 */
	const refreshDiscounts = useCallback(async () => {
		try {
			const documents = await fetchAllDocuments(
				databases,
				config.databases.bar.id,
				config.databases.bar.collections.discounts,
			);
			setDiscounts(documents);
		} catch (err) {
			console.error("error getting discounts", err);
		}
	}, [databases]);

	/**
	 * Fetch all items from database
	 * Items are products available for sale
	 * Ordered by name and limited to 1000 results
	 */
	const refreshItems = useCallback(async () => {
		try {
			const data = await databases.listDocuments({
				databaseId: config.databases.bar.id,
				collectionId: config.databases.bar.collections.items,
				queries: [Query.orderAsc("name"), Query.limit(1000)],
			});

			setItems((data.documents || []).map(normalizePosItem));
		} catch (err) {
			console.error("error getting items", err);
		}
	}, [databases]);

	/**
	 * Fetch configuration data from database
	 * Stores settings like member discount percentage
	 * Data is stored as key-value pairs
	 */
	const refreshData = useCallback(async () => {
		try {
			const data = await databases.listDocuments({
				databaseId: config.databases.data.id,
				collectionId: config.databases.data.collections.config,
			});
			let d = data.documents || [];
			let c = {};
			d.forEach((i) => {
				c[i.key] = i.value;
			});
			setData(c || {});
			setSettingsStatus(SETTINGS_OK);
		} catch (err) {
			console.error("error getting data", err);
			// Deliberately does NOT clear `data`: a config we read successfully five minutes
			// ago is better than nothing. But the status flips so a consumer that must fail
			// closed (the alcohol kill switch) knows this answer is stale/unavailable.
			setSettingsStatus(SETTINGS_UNAVAILABLE);
		}
	}, [databases]);

	const functions = useMemo(() => new Functions(client), [client]);

	/**
	 * Fetches the currently active event (isActive:true), if any -- used to gate the bar
	 * menu's alcohol display on whether alcohol is actually being sold right now, per the
	 * event's own sellsAlcohol flag and barOpenTime/barCloseTime window (set via the admin
	 * app's Events screen), and to scope DJ vouchers to their own event.
	 *
	 * This goes through Ticketing-ActiveEvent rather than reading the Events collection
	 * directly: Events is readable by the admin team only, while the register runs on an
	 * anonymous PIN session, so the direct read always 401'd and the old catch turned that
	 * into "no event tonight" -- permanently hiding every alcohol item and rejecting every
	 * DJ voucher. The function reads as the server and returns a field allowlist that
	 * deliberately excludes the per-event revenue/cogs/profit columns.
	 *
	 * Never collapses a failure into "no event": see parseActiveEventExecution for the
	 * two states this can return.
	 */
	const fetchActiveEvent = useCallback(async () => {
		let execution;
		try {
			execution = await functions.createExecution({
				functionId: ACTIVE_EVENT_FUNCTION_ID,
				body: JSON.stringify({}),
			});
		} catch (err) {
			console.error("error fetching active event", err);
			return activeEventUnavailable(err?.message || "the request failed");
		}
		const result = parseActiveEventExecution(execution);
		if (result.status === ACTIVE_EVENT_UNAVAILABLE) {
			console.error("error fetching active event", result.error);
		}
		return result;
	}, [functions]);

	/**
	 * Generate Stripe connection token via Appwrite Function
	 * Used for initializing Stripe Terminal connection
	 * 
	 * @returns {Promise<string>} Stripe connection token secret
	 */
	const generateStripeConnectionToken = useCallback(async () => {
		try {
			const response = await functions.createExecution({
				functionId: "68f2904a00171e8b0266",
				body: test ? JSON.stringify({ test: "test" }) : JSON.stringify({}),
			});
			const data = JSON.parse(response.responseBody);
			return data.secret;
		} catch (error) {
			console.error("Error generating Stripe connection token:", error);
		}
	}, [functions]);

	const [currentUser, setCurrentUser] = useState(null);
	const [pinMode, setPinModeState] = useState(() => getPinMode());
	// Set only when the last session check failed for a reason OTHER than "you're not logged
	// in" -- a transient network/timeout error on flaky venue WiFi, say. The caller can show a
	// retryable banner instead of the cashier being silently bounced to /login mid-shift.
	const [sessionError, setSessionError] = useState(null);

	/**
	 * Check the active session. Redirects to /login only on an actual authentication failure
	 * (Appwrite responds 401 -- there really is no valid session), never on a network/timeout
	 * error, which leaves whatever session state we already had alone and just surfaces
	 * `sessionError` so the UI can offer a retry instead of yanking an already-valid cashier
	 * session out from under them.
	 */
	const checkSession = useCallback(async () => {
		try {
			const acct = await account.get();
			setCurrentUser(acct);
			setSessionError(null);
			console.log("session active");
		} catch (err) {
			const isAuthFailure = err?.code === 401;

			if (!isAuthFailure) {
				console.error("Error checking session (keeping current session):", err);
				setSessionError("Couldn't verify your session -- check your connection and try again.");
				return;
			}

			setCurrentUser(null);
			setSessionError(null);
			try {
				// Redirect to login if not on the login page itself
				if (!window.location.pathname.startsWith("/login")) {
					console.log("no active session");
					window.location.href = "/login";
				}
			} catch (e) {
				console.error("error creating session", e);
			}
		}
	}, [account]);

	/**
	 * Check active session on component mount
	 */
	useEffect(() => {
		checkSession();
	}, [checkSession]);

	/**
	 * Staff login via Google SSO (the Skullspace Google Workspace account).
	 * Full-page redirect through Appwrite's OAuth2 flow -- there's no
	 * promise to await here, the browser navigates away to Google and
	 * back. `success`/`failure` land back on this same app; App.js's
	 * RequireAuth is what actually validates the returned session (checks
	 * the email is a real @skullspace.ca account, not just any Google
	 * account) and clears any stale PIN-mode flag, since that's the
	 * single choke point every /pos load already passes through.
	 */
	const loginWithGoogle = useCallback(() => {
		account.createOAuth2Session({
			provider: "google",
			success: `${window.location.origin}/pos`,
			failure: `${window.location.origin}/login?error=oauth_failed`,
		});
	}, [account]);

	/**
	 * Quick-access PIN login. Ensures an anonymous session exists first (so
	 * the device has "users"-level permission to create transactions), THEN
	 * verifies the PIN via the Verify-Pin function -- in that order, because
	 * Verify-Pin reads the caller's user id off the request to grant it
	 * membership in the payment-access team on a match (see its README),
	 * which only works if the session already exists by the time it's
	 * called. Restricted-mode gating (no refunds, sales reports capped to
	 * 24 hours; or, for a self-checkout kiosk PIN, no refunds/history/
	 * reporting at all) lives wherever `pinMode` is read, not here -- the
	 * caller (see PinEntryDialog.js) is what actually routes to /pos vs
	 * /self-checkout based on `result.selfCheckout`.
	 *
	 * @param {string} pin
	 * @returns {Promise<{ok: boolean, label?: string, selfCheckout?: boolean, bartenderId?: string|null}>}
	 * @throws {Error} If the PIN doesn't match -- with the server's specific reason (e.g. a
	 *   bartender pin used outside its event's 1-hour window) when one is given, instead of a
	 *   generic message that would hide it from the cashier.
	 */
	const loginWithPin = useCallback(
		async (pin) => {
			try {
				await account.get();
			} catch (err) {
				await account.createAnonymousSession();
			}

			const result = await verifyPin({ functions, pin });
			if (!result.ok) {
				throw new Error(result.error || "Incorrect PIN");
			}

			setPinMode(result.label, result.selfCheckout, result.bartenderId);
			setPinModeState({ label: result.label || null, selfCheckout: !!result.selfCheckout, bartenderId: result.bartenderId || null });
			return result;
		},
		[functions, account],
	);

	/**
	 * User logout
	 * Deletes current session and redirects to login
	 */
	async function logout(reason) {
		try {
			await account.deleteSession({ sessionId: "current" });
			clearPinMode();
			setPinModeState(null);
			window.location.href = reason ? `/login?error=${reason}` : "/login";
		} catch (err) {
			console.error("error logging out", err);
		}
	}

	/**
	 * Generate sales report for a date range
	 * Analyzes completed transactions and generates analytics
	 * 
	 * Includes:
	 * - Items sold with quantities and revenue
	 * - Sales breakdown by category (alcohol, food, drinks)
	 * - Payment method breakdown (cash, card, giftcard)
	 * - Discounts and tips
	 * - Cost of goods sold (COGS) and profit calculation
	 * 
	 * @param {Date} startDate - Report start date
	 * @param {Date} endDate - Report end date
	 * @returns {Promise<Object>} Sales report object with aggregated metrics
	 */
	// Function IDs -- see AppwriteFunctions/functions/Sales-Report and
	// .../Transactions-List. The client has no read access to the
	// Transactions collection at all (see the POS PIN-system security
	// plan), so both of these go through server-side functions instead of
	// databases.listDocuments -- the functions themselves enforce the 24h
	// clamp for non-staff callers based on real team membership, not a
	// client-passed flag.
	const SALES_REPORT_FUNCTION_ID = "6a9c687535280f239b5f";
	const TRANSACTIONS_LIST_FUNCTION_ID = "6a9c687ec05e99a6f1a8";

	async function fetchSalesReport(startDate, endDate, channel) {
		const response = await functions.createExecution({
			functionId: SALES_REPORT_FUNCTION_ID,
			body: JSON.stringify({
				startDate: startDate ? new Date(startDate).toISOString() : null,
				endDate: new Date(endDate).toISOString(),
				test,
				channel,
			}),
		});
		return JSON.parse(response.responseBody || "{}");
	}

	/**
	 * Fetch raw transaction documents from the last 24 hours, newest first,
	 * for the transactions/refund view. Unlike fetchSalesReport this
	 * returns every status (pending, complete, cancelled, refunded) rather
	 * than an aggregated "complete only" summary.
	 */
	async function fetchTransactions() {
		const response = await functions.createExecution({
			functionId: TRANSACTIONS_LIST_FUNCTION_ID,
			body: JSON.stringify({ test }),
		});
		const result = JSON.parse(response.responseBody || "{}");
		return result.documents || [];
	}

	// Return all public methods and state
	return {
		client,
		databases,
		account,
		teams,
		currentUser,
		config,
		categories,
		items,
		discounts,
		refreshCategories,
		refreshItems,
		refreshDiscounts,
		refreshData,
		fetchActiveEvent,
		settings: data,
		settingsStatus,
		loginWithGoogle,
		loginWithPin,
		pinMode,
		logout,
		sessionError,
		retrySessionCheck: checkSession,
		uniqueId: ID.unique,
		generateStripeConnectionToken,
		functions,
		fetchSalesReport,
		fetchTransactions,
	};
}
