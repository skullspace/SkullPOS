/**
 * splitPayment.js - Recording payment legs and reading them back
 *
 * A sale can be paid by any number of legs (multiple cards, cash+card,
 * giftcard+cash, giftcard+card, etc.) -- each leg is recorded server-side
 * via Transaction-RecordPayment, which appends it to the transaction's
 * `payments` array and decrements payment_due, flipping status to
 * "complete" once it reaches 0. See
 * AppwriteFunctions/functions/Transaction-RecordPayment.
 */

const RECORD_PAYMENT_FUNCTION_ID = "6a9c728a297df71f5919";

/**
 * @returns {Promise<{ok: boolean, remaining?: number, status?: string, error?: string}>}
 */
export async function recordPayment({ functions, transactionId, method, amount, giftcardId, paymentIntentId }) {
	const response = await functions.createExecution({
		functionId: RECORD_PAYMENT_FUNCTION_ID,
		body: JSON.stringify({ transactionId, method, amount, giftcardId, paymentIntentId }),
	});
	return JSON.parse(response.responseBody || "{}");
}

/**
 * Returns the list of payment legs for a transaction, for display (the
 * refund confirmation dialog, the sales report). New transactions carry
 * this directly in `payments`; older ones predate that and have only the
 * single-method legacy fields -- synthesize one leg from those instead.
 *
 * @returns {Array<{method: string, amount: number, giftcardId?: string, stripeId?: string}>}
 */
export function derivePaymentLegs(transaction) {
	if (transaction.payments) {
		try {
			const parsed = JSON.parse(transaction.payments);
			if (Array.isArray(parsed) && parsed.length > 0) return parsed;
		} catch (err) {
			// fall through to legacy derivation
		}
	}

	const legs = [];

	const giftcardIds = Array.isArray(transaction.giftcards) ? transaction.giftcards : [];
	const giftcardAmount = parseInt(transaction.giftcard_amount) || 0;
	if (giftcardIds.length > 0 && giftcardAmount > 0) {
		const giftcardId = typeof giftcardIds[0] === "object" ? giftcardIds[0].$id : giftcardIds[0];
		legs.push({ method: "giftcard", amount: giftcardAmount, giftcardId });
	}

	if (transaction.stripe_id) {
		legs.push({ method: "stripe", amount: parseInt(transaction.payment_due) || 0, stripeId: transaction.stripe_id });
	}

	if (legs.length === 0) {
		legs.push({ method: "cash", amount: parseInt(transaction.payment_due) || 0 });
	}

	return legs;
}

export const PAYMENT_METHOD_LABELS = {
	cash: "Cash",
	stripe: "Card",
	giftcard: "Gift Card",
};
