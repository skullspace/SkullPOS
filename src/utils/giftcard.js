/**
 * giftcard.js - Giftcard lookup, server-side
 *
 * The giftcards collection has no client read/write access (see the POS
 * PIN-system security plan) -- a blanket grant would let any session,
 * anonymous quick-access PIN sessions included, list every giftcard code
 * and balance in the system, or set one directly. Lookup and balance
 * changes go through Appwrite Functions instead:
 *   - Giftcard-Lookup: find one card by its exact code
 *   - Transaction-ApplyGiftcard: apply a giftcard payment (used by checkout.js)
 *   - Stripe-RefundPayment: credits a giftcard back on refund
 */

const GIFTCARD_LOOKUP_FUNCTION_ID = "6a9c5c1acb643536564a";

/**
 * Look up a giftcard by its UPC/code via the Giftcard-Lookup function.
 *
 * @param {Object} params
 * @param {Functions} params.functions - Appwrite Functions client
 * @param {string} params.code - Scanned/entered UPC or giftcard code
 * @returns {Promise<{$id: string, balance: number}|null>} A minimal
 *   giftcard-shaped object (just what checkout needs), or null if no match
 */
export async function findGiftcardByUPC({ functions, code }) {
	const response = await functions.createExecution({
		functionId: GIFTCARD_LOOKUP_FUNCTION_ID,
		body: JSON.stringify({ code }),
	});
	const result = JSON.parse(response.responseBody || "{}");
	if (!result.found) return null;
	return { $id: result.id, balance: result.balance || 0 };
}
