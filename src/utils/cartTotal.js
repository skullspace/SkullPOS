/**
 * cartTotal.js - Subtotal, discount and payable total for a cart
 *
 * Extracted out of pos.js's `calculateTotal` so the one money computation that
 * had never been testable is. Everything this returns is in integer cents, and
 * `total` is exactly what checkout.js writes as the transaction's `payment_due`
 * / `total`, and `discount` exactly what it writes as `discount` -- so a wrong
 * answer here is a wrong answer on the customer's card.
 *
 * The `discounts` collection is hand-edited in the Appwrite console (there is no
 * discount editor in the admin app), where `amount` is a nullable unbounded
 * int64 and `type` is a non-required enum with no default. So both of those can
 * arrive as values nobody intended, and this is the only place that can catch it.
 */

const PERCENT = "percent";
const CENTS = "cents";

/**
 * @param {Array<{price: number, quantity: number}>} cart
 * @param {{type?: string, amount?: number}|null} appliedDiscount
 * @returns {{subtotal: number, discount: number, total: number}} all in cents
 */
export function computeTotal(cart, appliedDiscount) {
	const subtotal = parseInt((cart || []).reduce((acc, item) => acc + item.price * item.quantity, 0)) || 0;

	if (!appliedDiscount) {
		return { subtotal, discount: 0, total: subtotal };
	}

	let raw;
	if (appliedDiscount.type === PERCENT) {
		raw = (subtotal * (appliedDiscount.amount || 0)) / 100;
	} else if (appliedDiscount.type === CENTS) {
		raw = appliedDiscount.amount || 0;
	} else {
		// Neither of the two the schema allows -- most likely a row saved with `type`
		// left null and `amount: 15` meaning 15 PERCENT. Falling through to the cents
		// branch (which is what the old `=== "percent"` check did) would silently take
		// 15 cents off a $40 tab and look like it worked. Refuse to guess: no discount,
		// and make the bad row visible.
		console.warn(
			`Discount "${appliedDiscount.name || appliedDiscount.$id || "(unnamed)"}" has an unrecognised type ` +
				`(${JSON.stringify(appliedDiscount.type)}) -- no discount applied. Fix the row's type to "percent" or "cents".`,
		);
		raw = 0;
	}

	// Clamped at BOTH ends. The upper bound (never more than the cart) was always
	// here; the lower one was not, so a row saved with a negative `amount` -- a typo,
	// or someone using it as a surcharge -- subtracted a negative and RAISED the
	// total, overcharging the customer and pushing Sales-Report's discount bucket
	// negative.
	const discount = Math.min(Math.max(parseInt(raw) || 0, 0), subtotal);

	return { subtotal, discount, total: subtotal - discount };
}
