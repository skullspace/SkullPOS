/**
 * transactionStatus.js - Cancelling an in-progress card attempt
 *
 * The client has no write access to Transactions at all (see the POS
 * PIN-system security plan). Marking a transaction complete now happens
 * via recordPayment (utils/splitPayment.js) once payment_due reaches 0 --
 * this function only covers the one remaining case: staff cancelling an
 * in-progress card attempt.
 */

const SET_STATUS_FUNCTION_ID = "6a9c65091672e55d90b1";

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
