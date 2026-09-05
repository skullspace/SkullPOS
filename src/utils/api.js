/**
 * api.js - Appwrite backend integration and authentication management
 * 
 * This module provides:
 * - Appwrite client initialization and configuration
 * - User authentication (login, register, logout)
 * - Database operations for categories, items, and transactions
 * - Sales report generation and analytics
 * - Stripe connection token generation for payment processing
 * 
 * Backend: Appwrite Backend-as-a-Service (BaaS)
 * Database structure:
 *   - bar database: contains categories, items, transactions, inventory, events, giftcards
 *   - data database: contains configuration settings
 */

import { Client as Appwrite, Databases, Account, ID, Functions, Query } from "appwrite";

import { useMemo, useState, useEffect, useCallback } from "react";

// Detect environment: use test mode if running on localhost
const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
const test = isLocalhost;

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
 * useAppwrite Hook - Main hook for Appwrite functionality
 * 
 * Provides:
 * - Authentication methods (login, register, logout)
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
	
	// Initialize Appwrite clients (memoized to prevent recreation)
	const client = useMemo(() => createClient(), []);
	const databases = useMemo(() => new Databases(client), [client]);
	const account = useMemo(() => new Account(client), [client]);

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
	 * Normalize a pos_items document to the field names the rest of the app
	 * expects (carried over from the old Items_old schema), so the migration
	 * to pos_items didn't require touching every component that reads an item.
	 */
	function normalizePosItem(doc) {
		return {
			...doc,
			price: doc.sale_price,
			enabledPOS: doc.enabled_pos,
			alcohol: doc.contains_alcohol,
		};
	}

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
		} catch (err) {
			console.error("error getting data", err);
		}
	}, [databases]);

	const functions = useMemo(() => new Functions(client), [client]);
	
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

	/**
	 * Check active session on component mount
	 * Redirects to login if no active session
	 */
	useEffect(() => {
		(async () => {
			try {
				const acct = await account.get();
				setCurrentUser(acct);
				console.log("session active");
			} catch (err) {
				setCurrentUser(null);
				try {
					// Redirect to login if not on authentication pages
					if (
						!window.location.pathname.startsWith("/login") &&
						!window.location.pathname.startsWith("/register")
					) {
						console.log("no active session");
						window.location.href = "/login";
					}
				} catch (e) {
					console.error("error creating session", e);
				}
			}
		})();
	}, [account]);

	/**
	 * User login with email and password
	 * Creates an authenticated session
	 * 
	 * @param {string} email - User email address
	 * @param {string} password - User password
	 * @returns {Promise<Object>} Login response object
	 * @throws {Error} If login fails or user already logged in
	 */
	const login = useCallback(
		async (email, password) => {
			try {
				let login = await account.get();
				console.log("already logged in", login);
				throw new Error("Already logged in");
			} catch (e) {}
			let newLoging = await account.createEmailPasswordSession({
				email,
				password,
			});
			console.log("login success", newLoging);
			return newLoging;
		},
		[account],
	);

	/**
	 * User logout
	 * Deletes current session and redirects to login
	 */
	async function logout() {
		try {
			await account.deleteSession({ sessionId: "current" });
			window.location.href = "/login";
		} catch (err) {
			console.error("error logging out", err);
		}
	}

	/**
	 * Register new user account
	 * Email must be @skullspace.ca domain
	 * 
	 * @param {Object} data - Registration data
	 * @param {string} data.name - User's full name
	 * @param {string} data.email - User email (@skullspace.ca required)
	 * @param {string} data.password - User password
	 * @returns {Promise<Object>} Created account object
	 * @throws {Error} If email domain is invalid or user already exists
	 */
	async function register(data) {
		const { name, email, password } = data;
		if (!email.endsWith("@skullspace.ca")) {
			throw new Error("Invalid email domain");
		}
		try {
			await account.get();
			throw new Error("Already logged in");
		} catch (err) {
			// Not logged in, continue
		}
		let id = ID.unique();
		return await account.create(id, email, password, name);
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
	async function fetchSalesReport(startDate, endDate) {
		startDate = new Date(startDate).toISOString();
		endDate = new Date(endDate).toISOString();

		const transactions = await fetchAllDocuments(
			databases,
			config.databases.bar.id,
			config.databases.bar.collections.transactions,
			[
				Query.equal("status", "complete"),
				Query.notEqual("testing", true),
				Query.greaterThanEqual("$createdAt", startDate),
				Query.lessThanEqual("$createdAt", endDate),
			],
		);

		// Look up categories by id (from live state) so sale-type
		// classification below doesn't depend on hardcoded category IDs.
		const categoriesById = {};
		categories.forEach((c) => {
			categoriesById[c.$id] = c;
		});

		// Cost-per-unit for each ingredient, used to cost pos_items via their
		// `ingredients` array (an ingredient's $id repeated once per unit used,
		// e.g. a double shot lists the spirit twice -- Appwrite arrays/relationships
		// have no native per-link quantity, so repetition stands in for it).
		let ingredientCostById = {};
		try {
			const ingredientDocs = await fetchAllDocuments(
				databases,
				config.databases.bar.id,
				config.databases.bar.collections.ingredients,
			);
			ingredientDocs.forEach((ing) => {
				const caseQty = ing.case_qty || 1;
				const contQty = ing.cont_qty || 1;
				ingredientCostById[ing.$id] = (ing.case_cost || 0) / (caseQty * contQty);
			});
		} catch (err) {
			console.error("error getting ingredients for COGS", err);
		}

		let ItemsSold = [],
			totalSales = 0,
			tips = 0,
			giftcardAmount = 0,
			cashAmount = 0,
			cardAmount = 0,
			discountAmount = 0,
			cogs = 0,
			amountPaid = 0,
			alcoholAmount = 0,
			foodAmount = 0,
			nonAlcoholicDrinksAmount = 0,
			otherAmountSold = 0;

		// Return empty report if no transactions found
		if (transactions.length === 0) {
			return {
				ItemsSold,
				totalSales,
				tips,
				giftcardAmount,
				cashAmount,
				cardAmount,
				discountAmount,
				amountPaid,
				cogs,
				alcoholAmount,
				foodAmount,
				nonAlcoholicDrinksAmount,
				otherAmountSold,
			};
		}
		
		// Aggregate transaction data
		transactions.forEach((item) => {
			let cart;
			try {
				cart = JSON.parse(item.cart) || [];
			} catch (err) {
				console.error("error parsing cart for transaction", item.$id, err);
				cart = [];
			}

			cart.forEach((cartItem) => {
				// Add or update item in sales list
				if (!ItemsSold.find((i) => i.name === cartItem.name)) {
					ItemsSold.push({
						name: cartItem.name,
						quantity: 0,
						revenue: 0,
						cogs: 0,
					});
				}
				let existingItem = ItemsSold.find((i) => i.name === cartItem.name);
				const quantity = cartItem.quantity || 0;
				const itemCost = cartItem.price || 0;

				existingItem.quantity += quantity;
				existingItem.revenue += itemCost * quantity;

				// Categorize sales by type using the live categories collection
				// (by name) rather than hardcoded category IDs, so this keeps
				// working if a category is ever recreated with a new ID.
				// cartItem.alcohol (added 2026-02-09) is checked first since
				// it's cheapest and covers transactions whose category lookup
				// misses for any reason.
				const catId =
					cartItem.categories && typeof cartItem.categories === "object"
						? cartItem.categories.$id
						: cartItem.categories;
				const cat = categoriesById[catId];
				const isAlcohol = cartItem.alcohol === true || cat?.alcohol === true;
				const catName = cat?.name || "";

				if (isAlcohol) {
					alcoholAmount += itemCost * quantity;
				} else if (catName === "Food") {
					foodAmount += itemCost * quantity;
				} else if (catName.includes("Non-Alcoholic")) {
					nonAlcoholicDrinksAmount += itemCost * quantity;
				} else {
					otherAmountSold += itemCost * quantity;
				}

				// Calculate cost of goods sold (COGS). Prefer the pos_items
				// ingredient list (real per-unit costs); fall back to the
				// legacy Items_old container_cost/drinks_per_cont fields for
				// transactions from before the ingredients migration.
				if (Array.isArray(cartItem.ingredients) && cartItem.ingredients.length > 0) {
					const perUnitCogs = cartItem.ingredients.reduce(
						(sum, ingredientId) => sum + (ingredientCostById[ingredientId] || 0),
						0,
					);
					const itemCogs = perUnitCogs * quantity;
					existingItem.cogs += itemCogs;
					cogs += itemCogs;
				} else if (cartItem.container_cost && cartItem.drinks_per_cont) {
					let itemCoGS = cartItem.container_cost / cartItem.drinks_per_cont;
					itemCoGS = itemCoGS + (cartItem.additional_drink_costs || 0);
					const itemCogs = itemCoGS * quantity;
					existingItem.cogs += itemCogs;
					cogs += itemCogs;
				}
			});

			// Aggregate transaction totals
			totalSales += (item.total || 0) + (item.discount || 0);
			amountPaid += item.payment_due || 0;
			tips += item.tip || 0;
			discountAmount += item.discount || 0;
			giftcardAmount += item.giftcard_amount || 0;

			// Break down by payment method
			if (item.payment_method === "cash") {
				cashAmount += item.payment_due || 0;
			} else {
				cardAmount += item.payment_due || 0;
			}
		});

		return {
			ItemsSold,
			totalSales,
			tips,
			giftcardAmount,
			cashAmount,
			cardAmount,
			discountAmount,
			amountPaid,
			cogs,
			alcoholAmount,
			foodAmount,
			nonAlcoholicDrinksAmount,
			otherAmountSold,
		};
	}

	/**
	 * Fetch raw transaction documents in a date range, newest first, for the
	 * transactions/refund view. Unlike fetchSalesReport this returns every
	 * status (pending, complete, cancelled, refunded) rather than an
	 * aggregated "complete only" summary.
	 */
	async function fetchTransactions(startDate, endDate) {
		const queries = [Query.notEqual("testing", true)];
		if (startDate) {
			queries.push(Query.greaterThanEqual("$createdAt", new Date(startDate).toISOString()));
		}
		if (endDate) {
			queries.push(Query.lessThanEqual("$createdAt", new Date(endDate).toISOString()));
		}

		const docs = await fetchAllDocuments(
			databases,
			config.databases.bar.id,
			config.databases.bar.collections.transactions,
			queries,
		);

		return docs.sort((a, b) => new Date(b.$createdAt) - new Date(a.$createdAt));
	}

	// Return all public methods and state
	return {
		client,
		databases,
		account,
		currentUser,
		config,
		categories,
		items,
		discounts,
		refreshCategories,
		refreshItems,
		refreshDiscounts,
		refreshData,
		settings: data,
		login,
		logout,
		register,
		uniqueId: ID.unique,
		generateStripeConnectionToken,
		functions,
		fetchSalesReport,
		fetchTransactions,
	};
}
