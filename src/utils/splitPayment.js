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
 * A per-leg idempotency key, generated once by the client and re-sent unchanged on
 * every retry of the SAME leg. Transaction-RecordPayment is expected to remember it
 * on the leg it appends and to return the current balance unchanged (rather than
 * appending a second leg) when it sees one it has already applied -- which is what
 * makes retrying a leg whose response we never received safe.
 */
export function newLegId() {
	if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
		return crypto.randomUUID();
	}
	return `leg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * @returns {Promise<{ok: boolean, remaining?: number, status?: string, error?: string}>}
 */
export async function recordPayment({ functions, transactionId, method, amount, giftcardId, paymentIntentId, legId }) {
	const response = await functions.createExecution({
		functionId: RECORD_PAYMENT_FUNCTION_ID,
		body: JSON.stringify({
			transactionId,
			method,
			amount,
			giftcardId,
			paymentIntentId,
			legId: legId || newLegId(),
		}),
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
	constructor(message, { method, amount, paymentIntentId, giftcardId, legId } = {}) {
		super(message);
		this.name = "RecordPaymentUnknownError";
		this.method = method;
		this.amount = amount;
		this.paymentIntentId = paymentIntentId;
		this.giftcardId = giftcardId;
		// The idempotency key the attempts were sent under -- the one thing that can
		// match this leg to a row the server may have written anyway.
		this.legId = legId;
	}
}

/**
 * recordPayment, retrying on transport failures (network drop, timeout,
 * function cold-start). Every attempt carries the SAME `legId`, generated
 * once here -- that key, not the transaction's own state, is what makes a
 * retry safe. The transaction's state is not enough on its own: a partly-paid
 * split sale is still "pending" and still has room under `payment_due` after
 * a leg commits, so an attempt that succeeded server-side but whose response
 * never came back would otherwise be appended a second time. Does NOT retry a
 * clean `{ok:false}` response -- a real validation failure (bad amount, card
 * declined verification, giftcard not found) won't fix itself.
 *
 * DEPLOY COUPLING: the safety above is a two-sided contract. It holds only against a
 * Transaction-RecordPayment that actually stores and de-duplicates on `legId`. Against an
 * older deployment the key is ignored and a retried-but-already-committed leg is appended
 * twice -- exactly the double-apply this was written to close, with the code claiming
 * otherwise. Ship POS and Transaction-RecordPayment together, never POS alone.
 *
 * If every attempt throws, throws RecordPaymentUnknownError instead of
 * the raw transport error, carrying the leg's details (paymentIntentId
 * especially) so the caller can surface something a staff member can
 * actually act on.
 */
export async function recordPaymentWithRetry(params, { attempts = 3, delayMs = 700 } = {}) {
	const legParams = { ...params, legId: params.legId || newLegId() };
	let lastError;
	for (let attempt = 1; attempt <= attempts; attempt++) {
		try {
			return await recordPayment(legParams);
		} catch (err) {
			lastError = err;
			if (attempt < attempts) {
				await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
			}
		}
	}
	throw new RecordPaymentUnknownError(lastError?.message || "Failed to reach the server", legParams);
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
 * Transaction-RecordPayment debits the giftcard in one write and appends the leg to the
 * transaction in a separate one ~85 lines later, with no rollback between them (Appwrite
 * gives it no multi-document transaction). Every other giftcard rejection -- not found,
 * revoked voucher, wrong event, amount over balance -- happens BEFORE the debit, so this
 * one error string is the only clean failure that means "the balance may already have
 * moved". Left bare it reads like nothing happened, and staff re-apply the card.
 *
 * Keep this in step with Transaction-RecordPayment's own string.
 */
const POST_DEBIT_ERROR = "Failed to update transaction";

/**
 * A message for a CLEAN `{ok:false}` rejection (the server answered, it just refused the
 * leg) -- as opposed to describeUnknownPaymentFailure, which is for "no answer at all".
 * Passes the server's own text through unchanged except where the client knows something
 * the bare text doesn't say.
 */
export function describeCleanLegFailure({ method, amount, error }) {
	const message = error || "Failed to record payment";
	if (method === "giftcard" && message.includes(POST_DEBIT_ERROR)) {
		return (
			`${message}. The giftcard balance may ALREADY have been reduced by ` +
			`$${((amount || 0) / 100).toFixed(2)} -- check the card's balance before applying it again.`
		);
	}
	return message;
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
