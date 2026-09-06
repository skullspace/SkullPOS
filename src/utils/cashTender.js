/**
 * cashTender.js - Pure helpers for the cash payment modal.
 *
 * Centralizes the one place this app converts a cashier-typed dollar
 * string into integer cents (everywhere else -- total, payment_due, every
 * payment leg -- is cents from the start), and suggests quick-tender
 * amounts so the common case ("customer paid with a $20") doesn't require
 * typing.
 */

const COMMON_BILLS_CENTS = [500, 1000, 2000, 5000, 10000]; // $5 / $10 / $20 / $50 / $100

/**
 * Parses a dollar-string input (e.g. "20", "20.5", "") into integer cents.
 * Never throws -- an empty, negative, or unparseable input is 0.
 */
export function parseDollarsToCents(value) {
	const n = parseFloat(value);
	if (!Number.isFinite(n) || n < 0) return 0;
	return Math.round(n * 100);
}

/**
 * Quick-tender amounts (in cents) for a given total: the exact total
 * itself, plus whichever common bill denominations are large enough to
 * actually cover it (so a $150 sale doesn't offer a nonsensical "$5"
 * button, and the exact-total amount never appears twice).
 */
export function suggestQuickTenders(totalCents) {
	const exact = Math.max(0, Math.round(totalCents) || 0);
	const bills = COMMON_BILLS_CENTS.filter((bill) => bill > exact);
	return [exact, ...bills];
}
