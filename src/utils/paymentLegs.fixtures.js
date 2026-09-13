/**
 * paymentLegs.fixtures.js - the shared case table for `derivePaymentLegs`.
 *
 * Five copies of `derivePaymentLegs` exist: four server-side
 * (AppwriteFunctions/functions/{Sales-Report,Stripe-RefundPayment,Admin-RollupEventSales,
 * Transaction-EmailReceipt}/src/paymentLegs.js) and one client-side
 * (POS/src/utils/splitPayment.js). They are duplicated on purpose -- each Appwrite function
 * deploys independently -- but that is exactly how the client copy silently fell a fix behind
 * the server ones (P2-29), so the refund confirmation dialog showed the operator LESS than
 * Stripe-RefundPayment was about to reverse.
 *
 * This table is the contract, kept apart from any one copy's test file so it can be dropped
 * into the other four verbatim. Every case is stated as `{transaction, legs}` and nothing in
 * it is implementation-specific. A divergence in ANY copy fails here.
 *
 * Amounts are integer cents throughout.
 */

export const PAYMENT_LEG_FIXTURES = [
	{
		name: "uses the payments array directly when present",
		transaction: {
			payments: JSON.stringify([
				{ method: "giftcard", amount: 400, giftcardId: "gc1" },
				{ method: "cash", amount: 600 },
			]),
			// Deliberately contradictory legacy fields: the recorded array wins outright,
			// nothing is re-derived or reconciled against them.
			total: 5000,
			payment_due: 5000,
		},
		legs: [
			{ method: "giftcard", amount: 400, giftcardId: "gc1" },
			{ method: "cash", amount: 600 },
		],
	},
	{
		name: "malformed payments JSON falls back to legacy derivation instead of throwing",
		transaction: { payments: "{not valid json", total: 500, payment_due: 500 },
		legs: [{ method: "cash", amount: 500 }],
	},
	{
		name: "an empty payments array also falls back to legacy derivation",
		transaction: { payments: "[]", total: 500, payment_due: 500 },
		legs: [{ method: "cash", amount: 500 }],
	},
	{
		name: "legacy: giftcard + stripe, payment_due still holding the card portion",
		transaction: {
			payments: null,
			giftcards: ["gc1"],
			giftcard_amount: 400,
			stripe_id: "pi_1",
			total: 1000,
			payment_due: 600,
		},
		legs: [
			{ method: "giftcard", amount: 400, giftcardId: "gc1" },
			{ method: "stripe", amount: 600, stripeId: "pi_1" },
		],
	},
	{
		// The original bug: the retired completion path zeroed payment_due on a real card
		// charge. Deriving the card leg from it reported $0 of card revenue for that sale.
		name: "legacy: card-only with a zeroed payment_due derives the card leg from total",
		transaction: { stripe_id: "pi_1", total: 1200, payment_due: 0 },
		legs: [{ method: "stripe", amount: 1200, stripeId: "pi_1" }],
	},
	{
		name: "legacy: zeroed payment_due still nets the card leg down by the giftcard leg",
		transaction: {
			giftcards: ["gc1"],
			giftcard_amount: 300,
			stripe_id: "pi_1",
			total: 1000,
			payment_due: 0,
		},
		legs: [
			{ method: "giftcard", amount: 300, giftcardId: "gc1" },
			{ method: "stripe", amount: 700, stripeId: "pi_1" },
		],
	},
	{
		// payment_due here reflects only the CARD portion of what was left after the giftcard;
		// the gap between that and the true remainder is the cash portion, which used to be
		// dropped entirely since a cash leg was only ever synthesized when NO other leg existed.
		name: "legacy: a genuine giftcard + card + cash 3-way split reconstructs all three legs",
		transaction: {
			giftcards: ["gc1"],
			giftcard_amount: 300,
			stripe_id: "pi_1",
			total: 1000,
			payment_due: 400,
		},
		legs: [
			{ method: "giftcard", amount: 300, giftcardId: "gc1" },
			{ method: "stripe", amount: 400, stripeId: "pi_1" },
			{ method: "cash", amount: 300 },
		],
	},
	{
		name: "legacy: partial giftcard with the rest in cash keeps the cash leg",
		transaction: { giftcards: ["gc1"], giftcard_amount: 300, total: 1000, payment_due: 0 },
		legs: [
			{ method: "giftcard", amount: 300, giftcardId: "gc1" },
			{ method: "cash", amount: 700 },
		],
	},
	{
		// The shape 77 real rows are actually in: `giftcard_amount` set, `giftcards` never
		// written by anything. Requiring both used to skip the leg and fold the whole amount
		// into the synthesized cash leg -- $458.25 of gift-card redemptions reported as cash,
		// and offered back as cash out of the drawer on refund (P1-3).
		name: "legacy: giftcard_amount with an empty relationship is a giftcard leg, not cash",
		transaction: { giftcards: [], giftcard_amount: 500, total: 500, payment_due: 0 },
		legs: [{ method: "giftcard", amount: 500 }],
	},
	{
		name: "legacy: a missing relationship still nets the card leg down correctly",
		transaction: { giftcard_amount: 300, stripe_id: "pi_1", total: 1000, payment_due: 0 },
		legs: [
			{ method: "giftcard", amount: 300 },
			{ method: "stripe", amount: 700, stripeId: "pi_1" },
		],
	},
	{
		name: "legacy: giftcard relationship stored as an expanded object, not a bare id",
		transaction: {
			giftcards: [{ $id: "gc1", balance: 999 }],
			giftcard_amount: 400,
			total: 400,
			payment_due: 0,
		},
		legs: [{ method: "giftcard", amount: 400, giftcardId: "gc1" }],
	},
	{
		name: "legacy: giftcard-only transaction (no stripe_id)",
		transaction: { giftcards: ["gc1"], giftcard_amount: 1000, total: 1000, payment_due: 0 },
		legs: [{ method: "giftcard", amount: 1000, giftcardId: "gc1" }],
	},
	{
		name: "legacy: card-only transaction reports the full amount when payment_due is intact",
		transaction: { stripe_id: "pi_1", total: 1200, payment_due: 1200 },
		legs: [{ method: "stripe", amount: 1200, stripeId: "pi_1" }],
	},
	{
		name: "legacy: cash-only transaction (no giftcard, no stripe_id)",
		transaction: { total: 500, payment_due: 500 },
		legs: [{ method: "cash", amount: 500 }],
	},
	{
		// An over-applied giftcard (comped/adjusted row) must not produce a negative card leg
		// or a phantom cash leg -- both would be refunded as real money.
		name: "legacy: a giftcard covering more than the total yields no card or cash leg",
		transaction: { giftcards: ["gc1"], giftcard_amount: 1500, stripe_id: "pi_1", total: 1000, payment_due: 0 },
		legs: [
			{ method: "giftcard", amount: 1500, giftcardId: "gc1" },
			{ method: "stripe", amount: 0, stripeId: "pi_1" },
		],
	},
];
