/**
 * giftcard.js - Giftcard lookup, server-side
 *
 * The giftcards collection has no client read/write access (see the POS
 * PIN-system security plan) -- a blanket grant would let any session,
 * anonymous quick-access PIN sessions included, list every giftcard code
 * and balance in the system, or set one directly. Lookup and balance
 * changes go through Appwrite Functions instead:
 *   - Giftcard-Lookup: find one card by its exact code
 *   - Transaction-RecordPayment: apply a giftcard payment leg (used by checkout.js)
 *   - Stripe-RefundPayment: credits a giftcard back on refund
 */

import { formatCAD } from "./format";

const GIFTCARD_LOOKUP_FUNCTION_ID = "6a9c5c1acb643536564a";

/**
 * The smallest amount `chargeCard` (stripe.js) will put on the reader. Stripe rejects a
 * CAD PaymentIntent under 50c, so the first chargeable amount above it is 51c.
 */
export const STRIPE_MIN_CHARGE_CENTS = 51;

/**
 * Decide how much of a giftcard to apply to a sale, given that whatever is left over has to be
 * chargeable on the reader.
 *
 * Applying the naive `min(balance, total)` is what wedged the till (P2-24): a $4.50 card against
 * a $4.88 sale debits the card to $0 and leaves a 38c card leg, which `chargeCard` refuses
 * outright ("Amount must be greater than 50 cents"). Retry takes the identical branch and fails
 * the same way, there is no cash path out of the giftcard flow, and the only remaining button --
 * Close -- cancels the sale and credits the $4.50 back. The customer is told their giftcard was
 * used, then watches it come back un-used, and the sale cannot be rung at all.
 *
 * So cap the giftcard leg at `total - STRIPE_MIN_CHARGE_CENTS` whenever the naive split would
 * leave an uncharageable remainder: the sale completes, and the few cents that would have been
 * stranded stay on the customer's card (visible in the applied/remaining readout) instead of the
 * whole sale dead-ending. The cap always fits inside the balance -- it is strictly less than
 * `balance` in every case that reaches it.
 *
 * When the sale itself is too small to leave a chargeable remainder at all (total < 52c and the
 * card can't cover it), no split exists. Say so BEFORE the card is debited, so the exit is just
 * "take it in cash" rather than a cancelled sale with a giftcard to re-credit.
 *
 * @param {{total: number, balance: number}} params - both in integer cents
 * @returns {{ok: true, applyAmount: number, cardRemainder: number, capped: boolean}
 *          |{ok: false, error: string}}
 */
export function planGiftcardLeg({ total, balance }) {
	const saleTotal = parseInt(total) || 0;
	const cardBalance = parseInt(balance) || 0;

	if (cardBalance <= 0) {
		return { ok: false, error: "This gift card has no balance left -- clear it and take payment another way." };
	}

	const applyAmount = Math.min(cardBalance, saleTotal);
	const remainder = saleTotal - applyAmount;

	if (remainder === 0 || remainder >= STRIPE_MIN_CHARGE_CENTS) {
		return { ok: true, applyAmount, cardRemainder: remainder, capped: false };
	}

	const cappedApply = saleTotal - STRIPE_MIN_CHARGE_CENTS;
	if (cappedApply >= 1) {
		return { ok: true, applyAmount: cappedApply, cardRemainder: STRIPE_MIN_CHARGE_CENTS, capped: true };
	}

	return {
		ok: false,
		error:
			`This gift card leaves ${formatCAD(remainder)} to charge, under the ` +
			`${formatCAD(STRIPE_MIN_CHARGE_CENTS)} card minimum. Take the ${formatCAD(saleTotal)} in cash, or add ` +
			`to the order first -- the gift card has NOT been used.`,
	};
}

/**
 * Look up a giftcard by its UPC/code via the Giftcard-Lookup function.
 *
 * @param {Object} params
 * @param {Functions} params.functions - Appwrite Functions client
 * @param {string} params.code - Scanned/entered UPC or giftcard code
 * @returns {Promise<{$id: string, balance: number, eventId: string|null, active: boolean}|null>}
 *   A minimal giftcard-shaped object (just what checkout needs), or null if no match.
 *   `eventId` is set only for a DJ voucher (a giftcard scoped to one event) -- a standing
 *   customer gift card always has `eventId: null`.
 */
export async function findGiftcardByUPC({ functions, code }) {
	const response = await functions.createExecution({
		functionId: GIFTCARD_LOOKUP_FUNCTION_ID,
		body: JSON.stringify({ code }),
	});
	const result = JSON.parse(response.responseBody || "{}");
	if (!result.found) return null;
	return {
		$id: result.id,
		balance: result.balance || 0,
		eventId: result.eventId || null,
		active: result.active !== false,
	};
}
