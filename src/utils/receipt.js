/**
 * receipt.js - Emailing a receipt for a completed (or refunded) sale.
 *
 * All the actual work happens server-side in the Transaction-EmailReceipt
 * function: reading the transaction, itemizing the cart and payment legs,
 * and sending via Resend. The client has no way to read a transaction's
 * cart/payment details directly (see the POS PIN-system security plan), so
 * this is the only way a receipt can be sent -- see
 * AppwriteFunctions/functions/Transaction-EmailReceipt.
 */

export const EMAIL_RECEIPT_FUNCTION_ID = "6a9cd1ed552967ba3560";

export async function emailReceipt({ functions, transactionId, email }) {
	const response = await functions.createExecution({
		functionId: EMAIL_RECEIPT_FUNCTION_ID,
		body: JSON.stringify({ transactionId, email }),
	});
	const data = JSON.parse(response.responseBody || "{}");
	if (!data.ok) {
		throw new Error(data.error || "Failed to send receipt");
	}
	return true;
}
