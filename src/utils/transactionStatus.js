/**
 * transactionStatus.js - Server-side transaction status transitions
 *
 * The client has no write access to Transactions at all (see the POS
 * PIN-system security plan) -- both finalization paths go through
 * functions instead of a direct databases.updateDocument call:
 *   - Transaction-SetStatus: cash confirmed / card attempt cancelled
 *   - Transaction-RecordCardPayment: card charge succeeded (verified
 *     independently against the real Stripe API server-side)
 */

const SET_STATUS_FUNCTION_ID = "6a9c65091672e55d90b1";
const RECORD_CARD_PAYMENT_FUNCTION_ID = "6a9c6511bdde9d87944c";

/**
 * @returns {Promise<{ok: boolean, status?: string, error?: string}>}
 */
export async function setTransactionStatus({ functions, transactionId, status }) {
	const response = await functions.createExecution({
		functionId: SET_STATUS_FUNCTION_ID,
		body: JSON.stringify({ transactionId, status }),
	});
	return JSON.parse(response.responseBody || "{}");
}

/**
 * @returns {Promise<{ok: boolean, tip?: number, error?: string}>}
 */
export async function recordCardPayment({ functions, transactionId, paymentIntentId }) {
	const response = await functions.createExecution({
		functionId: RECORD_CARD_PAYMENT_FUNCTION_ID,
		body: JSON.stringify({ transactionId, paymentIntentId }),
	});
	return JSON.parse(response.responseBody || "{}");
}
