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
 * Thrown by recordPaymentWithRetry only when every attempt failed to even
 * reach the server (not a clean rejection) -- server-side state is
 * genuinely unknown. For a stripe/giftcard leg this means real money or
 * giftcard balance may have already moved with no confirmed record of it
 * on this transaction, which callers should tell staff explicitly rather
 * than showing a generic error (or worse, a false "success").
 */
export class RecordPaymentUnknownError extends Error {
	constructor(message, { method, amount, paymentIntentId, giftcardId } = {}) {
		super(message);
		this.name = "RecordPaymentUnknownError";
		this.method = method;
		this.amount = amount;
		this.paymentIntentId = paymentIntentId;
		this.giftcardId = giftcardId;
	}
}

/**
 * recordPayment, retrying on transport failures (network drop, timeout,
 * function cold-start) -- safe to retry because Transaction-RecordPayment
 * re-reads the transaction fresh on every call and rejects once it's no
 * longer "pending" or a leg would exceed the remaining balance, so
 * retrying after an already-successful-but-unacknowledged attempt is a
 * clean no-op rather than a double-application. Does NOT retry a clean
 * `{ok:false}` response -- a real validation failure (bad amount, card
 * declined verification, giftcard not found) won't fix itself.
 *
 * If every attempt throws, throws RecordPaymentUnknownError instead of
 * the raw transport error, carrying the leg's details (paymentIntentId
 * especially) so the caller can surface something a staff member can
 * actually act on.
 */
export async function recordPaymentWithRetry(params, { attempts = 3, delayMs = 700 } = {}) {
	let lastError;
	for (let attempt = 1; attempt <= attempts; attempt++) {
		try {
			return await recordPayment(params);
		} catch (err) {
			lastError = err;
			if (attempt < attempts) {
				await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
			}
		}
	}
	throw new RecordPaymentUnknownError(lastError?.message || "Failed to reach the server", params);
}

/**
 * A human-readable, actionable message for when recordPaymentWithRetry's
 * attempts were all exhausted -- tailored per method, since what staff
 * should do next differs (a card leg means real money may have moved; a
 * giftcard leg means its balance may have already been debited; cash has
 * no external side effect to worry about).
 */
export function describeUnknownPaymentFailure(err) {
	if (err?.method === "stripe") {
		return (
			`Card may have been charged $${((err.amount || 0) / 100).toFixed(2)} but we couldn't confirm it was ` +
			`saved -- do NOT charge this card again. Check Stripe for payment ${err.paymentIntentId || "(unknown)"} ` +
			`and reconcile manually if it succeeded.`
		);
	}
	if (err?.method === "giftcard") {
		return (
			`Giftcard balance may have already been reduced by $${((err.amount || 0) / 100).toFixed(2)} but we ` +
			`couldn't confirm it was saved -- check the giftcard's balance before applying it again.`
		);
	}
	return err?.message || "Failed to record payment -- please check the transaction before retrying.";
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
