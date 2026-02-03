import {
	Client as Appwrite,
	Databases,
	Account,
	ID,
	Functions,
	Query,
} from "appwrite";

import { useMemo, useState, useEffect, useCallback } from "react";

// if on localhost, use test mode
const isLocalhost =
	window.location.hostname === "localhost" ||
	window.location.hostname === "127.0.0.1";

const test = isLocalhost;

// db id 67c9ffd9003d68236514
// items collection id 67c9ffe6001c17071bb7
// category collection id 67c9ffdd0039c4e09c9a

/*
Transactions
    stripe_id
    items
    cost
    status
    tip
    event
    discount
    discount_reason
    payment_method
*/

const config = {
	endpoint: "https://api.cloud.shotty.tech/v1",
	project: "68f2ac7b00002e7563a8",
	databases: {
		bar: {
			id: "67c9ffd9003d68236514",
			collections: {
				categories: "67c9ffdd0039c4e09c9a",
				items: "67c9ffe6001c17071bb7",
				events: "68e400210008d19bb5c9",
				inventory: "68e400210008d19bb5c9",
				transactions: "68e4cd3500179ce661c6",
				giftcards: "giftcards",
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

function createClient() {
	const client = new Appwrite();
	client.setEndpoint(config.endpoint).setProject(config.project);
	return client;
}

export function useAppwrite() {
	const [categories, setCategories] = useState([]);
	const [items, setItems] = useState([]);
	const [data, setData] = useState(null);
	//const [events, setEvents] = useState(null);
	const client = useMemo(() => createClient(), []);
	const databases = useMemo(() => new Databases(client), [client]);
	const account = useMemo(() => new Account(client), [client]);

	const refreshCategories = useCallback(async () => {
		try {
			const data = await databases.listDocuments(
				config.databases.bar.id,
				config.databases.bar.collections.categories,
			);
			setCategories(data.documents || []);
		} catch (err) {
			console.error("error getting categories", err);
		}
	}, [databases]);

	const refreshItems = useCallback(async () => {
		try {
			const data = await databases.listDocuments({
				databaseId: config.databases.bar.id,
				collectionId: config.databases.bar.collections.items,
				queries: [Query.orderAsc("name"), Query.limit(1000)],
			});

			setItems(data.documents || []);
		} catch (err) {
			console.error("error getting items", err);
		}
	}, [databases]);

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

	// const refreshEvents = useCallback(async () => {
	//     try {
	//         const data = await databases.listDocuments({
	//             databaseId: config.databases.data.id,
	//             collectionId: config.databases.data.collections.events
	//         });
	//         setEvents(data.documents || []);
	//     } catch (err) {
	//         console.error('error getting events', err);
	//     }
	// }, [databases]);

	// call function to generate connection token from strip (appwrite function id:68f2904a00171e8b0266)

	const functions = useMemo(() => new Functions(client), [client]);
	const generateStripeConnectionToken = useCallback(async () => {
		try {
			const response = await functions.createExecution({
				functionId: "68f2904a00171e8b0266",
				body: test
					? JSON.stringify({ test: "test" })
					: JSON.stringify({}),
			});
			const data = JSON.parse(response.responseBody);
			return data.secret;
		} catch (error) {
			console.error("Error generating Stripe connection token:", error);
		}
	}, [functions]);

	useEffect(() => {
		(async () => {
			try {
				await account.get();
				console.log("session active");
			} catch (err) {
				try {
					// if not on login or register page, redirect to login
					if (
						!window.location.pathname.startsWith("/login") &&
						!window.location.pathname.startsWith("/register")
					) {
						console.log("no active session");
						// redirect to login
						window.location.href = "/login";
					}
				} catch (e) {
					console.error("error creating session", e);
				}
			}
		})();
	}, [account]);

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

	async function logout() {
		try {
			await account.deleteSession({ sessionId: "current" });
			window.location.href = "/login";
		} catch (err) {
			console.error("error logging out", err);
		}
	}

	async function register(data) {
		const { name, email, password } = data;
		if (!email.endsWith("@skullspace.ca")) {
			throw new Error("Invalid email domain");
		}
		try {
			await account.get();
			throw new Error("Already logged in");
		} catch (err) {
			// not logged in, continue
		}
		let id = ID.unique();
		return await account.create(id, email, password, name);
	}

	return {
		client,
		databases,
		account,
		config,
		categories,
		items,
		refreshCategories,
		refreshItems,
		refreshData,
		settings: data,
		login,
		logout,
		register,
		uniqueId: ID.unique,
		generateStripeConnectionToken,
		functions,
	};
}
