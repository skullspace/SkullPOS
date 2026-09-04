/**
 * giftcard.js - Shared giftcard lookup and balance update helpers
 *
 * Centralizes giftcard logic that was previously duplicated between
 * checkout.js and pos.js's retry flow.
 */

import { Query } from "appwrite";

/**
 * Look up a giftcard by its UPC/code.
 *
 * Queries server-side instead of pulling the entire giftcards collection
 * to the client. Query.equal matches both a plain string UPC and an
 * array-type UPC attribute that contains the code, so this works
 * regardless of which shape a given document was saved with.
 *
 * @param {Object} params
 * @param {Databases} params.databases - Appwrite Databases instance
 * @param {Object} params.config - App config with database/collection IDs
 * @param {string} params.code - Scanned/entered UPC or giftcard code
 * @returns {Promise<Object|null>} The matching giftcard document, or null
 */
export async function findGiftcardByUPC({ databases, config, code }) {
	const collectionId = config?.databases?.bar?.collections?.giftcards;
	if (!collectionId) {
		throw new Error("Giftcards collection not configured");
	}

	const res = await databases.listDocuments({
		databaseId: config.databases.bar.id,
		collectionId,
		queries: [Query.equal("UPC", code), Query.limit(25)],
	});

	const docs = res.documents || [];

	// Defensive fallback in case UPC's stored shape varies across documents
	// (e.g. a legacy string containing the code as a substring).
	const found =
		docs.find((d) => {
			const upc = d.UPC;
			if (Array.isArray(upc)) return upc.includes(code);
			if (typeof upc === "string") return upc === code || upc.includes(code);
			return false;
		}) || null;

	return found;
}

/**
 * Atomically-intentioned decrement of a giftcard's balance.
 *
 * Note: Appwrite's client SDK has no native atomic decrement, so this is
 * still a read-then-write from whatever balance the caller already has in
 * memory. Concurrent redemptions of the same card can race. For real
 * atomicity this should move to a server-side Appwrite Function that reads
 * and writes the balance in a single trusted operation.
 *
 * @param {Object} params
 * @param {Databases} params.databases - Appwrite Databases instance
 * @param {Object} params.config - App config with database/collection IDs
 * @param {string} params.giftcardId - Giftcard document $id
 * @param {number} params.currentBalance - Balance read before this redemption
 * @param {number} params.amount - Amount to deduct (in cents)
 * @returns {Promise<number>} The new balance written to the document
 */
export async function decrementGiftcardBalance({ databases, config, giftcardId, currentBalance, amount }) {
	const newBalance = (currentBalance || 0) - (amount || 0);

	await databases.updateDocument({
		databaseId: config.databases.bar.id,
		collectionId: config.databases.bar.collections.giftcards,
		documentId: giftcardId,
		data: { balance: newBalance },
	});

	return newBalance;
}
