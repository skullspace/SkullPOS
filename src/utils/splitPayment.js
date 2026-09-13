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
 * Kept in sync by hand with the identical copies in
 * AppwriteFunctions/functions/{Sales-Report,Stripe-RefundPayment,Admin-RollupEventSales,
 * Transaction-EmailReceipt}/src/paymentLegs.js -- every consumer that needs to know how a
 * transaction was actually paid carries its own copy, since the Appwrite functions deploy
 * independently of each other and of this client.
 *
 * This one is the client's, and it is the copy the operator READS BEFORE CONFIRMING A REFUND
 * (transactionsView.js), while Stripe-RefundPayment's copy decides what actually reverses. The
 * two disagreeing is the whole hazard: this file drifted behind the server copies once already
 * (P2-29) and showed less than what would be reversed. `paymentLegs.fixtures.js` is the shared
 * case table both sides assert against -- change the body here and there together, and run the
 * fixtures on both.
 *
 * Returns the list of payment legs for a transaction: {method, amount, giftcardId?,
 * stripeId?}[]. New transactions (written by Transaction-RecordPayment) carry this directly in
 * `payments`. Older ones predate that and have only the single-method legacy fields --
 * synthesize legs from those instead, so nothing needs a data migration.
 *
 * `transaction.total` is confirmed (by inspecting real pre-migration rows) to already be net of
 * `discount` and exclusive of `tip` -- both are tracked/reported as their own separate fields
 * project-wide -- so neither needs subtracting here.
 *
 * The card/stripe leg used to be derived from `payment_due`, which is 0 on every transaction the
 * (now-retired) legacy completion path finished, silently reporting $0 of card revenue for a
 * real charge. Real legacy rows show `payment_due` reliably held "whatever wasn't covered by the
 * giftcard leg" right up until completion, so it's still the most accurate source for the card
 * amount *when it's actually populated* -- this only falls back to deriving the amount from
 * `total` when `payment_due` looks stale/zeroed (the actual bug), rather than discarding it
 * outright. This also naturally supports the legacy system's rare "giftcard + card + cash"
 * 3-way split (where the card only covered part of what was left after the giftcard, and the
 * remaining balance was cash): whatever isn't accounted for by the giftcard and (if present)
 * stripe leg found is synthesized as a cash leg -- not just when NO other leg was found at all,
 * which previously dropped that remainder silently.
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
	let remaining = parseInt(transaction.total) || 0;

	// Keyed off `giftcard_amount` ALONE, never off the relationship as well. Requiring both is
	// what buried $458.25 of gift-card redemptions in the cash bucket (P1-3): of the 77 rows
	// carrying a positive `giftcard_amount`, not one has a non-empty `giftcards` relationship --
	// nothing has ever written that attribute -- so `giftcardIds.length > 0 && ...` was false on
	// every legacy row, the leg was skipped, and the whole amount fell through to the cash leg
	// synthesized from the remainder below. The card id is attached when the relationship does
	// carry one and simply omitted when it does not: a giftcard leg with no id still buckets the
	// revenue correctly, and Stripe-RefundPayment reports it as needing a manual credit instead of
	// handing the customer cash for a gift-card payment.
	const giftcardIds = Array.isArray(transaction.giftcards) ? transaction.giftcards : [];
	const giftcardAmount = parseInt(transaction.giftcard_amount) || 0;
	if (giftcardAmount > 0) {
		const rawId = giftcardIds.length > 0 ? giftcardIds[0] : null;
		const giftcardId = rawId && typeof rawId === "object" ? rawId.$id : rawId;
		legs.push({ method: "giftcard", amount: giftcardAmount, ...(giftcardId ? { giftcardId } : {}) });
		remaining -= giftcardAmount;
	}

	if (transaction.stripe_id) {
		const recordedDue = parseInt(transaction.payment_due) || 0;
		const stripeAmount = recordedDue > 0 ? Math.min(recordedDue, Math.max(remaining, 0)) : Math.max(remaining, 0);
		legs.push({ method: "stripe", amount: stripeAmount, stripeId: transaction.stripe_id });
		remaining -= stripeAmount;
	}

	if (remaining > 0) {
		legs.push({ method: "cash", amount: remaining });
	}

	return legs;
}

export const PAYMENT_METHOD_LABELS = {
	cash: "Cash",
	stripe: "Card",
	giftcard: "Gift Card",
};
