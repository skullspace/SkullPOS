/**
 * bartenderSales.js - Fetches a bartender's own sales/tips via the
 * Bartender-Sales Appwrite Function, scoped server-side to their own
 * bartenderId -- see pinMode.bartenderId (set by Verify-Pin on a
 * bartender's own event-scoped pin).
 */

const BARTENDER_SALES_FUNCTION_ID = "bartender-sales";

/**
 * @param {Object} params
 * @param {Functions} params.functions - Appwrite Functions client
 * @param {string} params.bartenderId
 * @returns {Promise<{salesTotal: number, tipsTotal: number, transactionCount: number, transactions: Array}>}
 */
export async function fetchMySales({ functions, bartenderId }) {
	const response = await functions.createExecution({
		functionId: BARTENDER_SALES_FUNCTION_ID,
		body: JSON.stringify({ bartenderId }),
	});
	const result = JSON.parse(response.responseBody || "{}");
	if (result.error) {
		throw new Error(result.error);
	}
	return result;
}
