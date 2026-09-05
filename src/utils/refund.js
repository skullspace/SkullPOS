/**
 * refund.js - Refund orchestration for completed transactions
 *
 * All of the actual work happens server-side in the Stripe-RefundPayment
 * function: reading the transaction, refunding the card portion via Stripe
 * if paid, crediting back the giftcard portion if applied, and marking the
 * transaction "refunded". The client has no write access to
 * Transactions/giftcards at all, so this is the only way a refund can
 * happen -- see AppwriteFunctions/functions/Stripe-RefundPayment.
 */

export const STRIPE_REFUND_FUNCTION_ID = "6a9b7671df1f504a084e";

export async function refundTransaction({ functions, transaction }) {
	if (!transaction) throw new Error("No transaction provided");

	const response = await functions.createExecution({
		functionId: STRIPE_REFUND_FUNCTION_ID,
		body: JSON.stringify({ transactionId: transaction.$id }),
	});
	const data = JSON.parse(response.responseBody || "{}");
	if (!data.ok) {
		throw new Error(data.error || "Refund failed");
	}

	return true;
}
