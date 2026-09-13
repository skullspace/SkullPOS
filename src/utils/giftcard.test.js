import { findGiftcardByUPC, planGiftcardLeg, STRIPE_MIN_CHARGE_CENTS } from "./giftcard";

describe("findGiftcardByUPC", () => {
	test("returns a minimal giftcard shape when found", async () => {
		const functions = {
			createExecution: jest
				.fn()
				.mockResolvedValue({ responseBody: JSON.stringify({ found: true, id: "gc1", balance: 5000 }) }),
		};

		const result = await findGiftcardByUPC({ functions, code: "75855000001" });

		expect(result).toEqual({ $id: "gc1", balance: 5000, eventId: null, active: true });
		expect(functions.createExecution).toHaveBeenCalledWith({
			functionId: "6a9c5c1acb643536564a",
			body: JSON.stringify({ code: "75855000001" }),
		});
	});

	test("surfaces DJ-voucher fields when the response includes them", async () => {
		const functions = {
			createExecution: jest.fn().mockResolvedValue({
				responseBody: JSON.stringify({ found: true, id: "gc9", balance: 2000, eventId: "event1", active: false }),
			}),
		};

		const result = await findGiftcardByUPC({ functions, code: "75855999" });

		expect(result).toEqual({ $id: "gc9", balance: 2000, eventId: "event1", active: false });
	});

	test("returns null when no giftcard matches", async () => {
		const functions = { createExecution: jest.fn().mockResolvedValue({ responseBody: JSON.stringify({ found: false }) }) };

		const result = await findGiftcardByUPC({ functions, code: "nope" });

		expect(result).toBeNull();
	});

	test("defaults balance to 0 when absent from the response", async () => {
		const functions = {
			createExecution: jest.fn().mockResolvedValue({ responseBody: JSON.stringify({ found: true, id: "gc1" }) }),
		};

		const result = await findGiftcardByUPC({ functions, code: "75855000001" });

		expect(result).toEqual({ $id: "gc1", balance: 0, eventId: null, active: true });
	});
});

/**
 * P2-24. The naive split -- apply min(balance, total), charge whatever is left -- wedges the
 * till whenever "whatever is left" lands between 1c and 50c: the reader refuses it, Retry
 * reproduces it, the giftcard flow has no cash branch, and Close cancels the sale after the
 * card was already debited. These cover the boundary in both directions.
 */
describe("planGiftcardLeg", () => {
	test("a giftcard that covers the whole sale is applied in full, with nothing on the card", () => {
		expect(planGiftcardLeg({ total: 1000, balance: 2500 })).toEqual({
			applyAmount: 1000,
			cardRemainder: 0,
			capped: false,
			ok: true,
		});
	});

	test("a partial giftcard leaving a comfortably chargeable remainder is applied in full", () => {
		expect(planGiftcardLeg({ total: 2000, balance: 1200 })).toEqual({
			applyAmount: 1200,
			cardRemainder: 800,
			capped: false,
			ok: true,
		});
	});

	test("the reported failure -- $4.50 card against a $4.88 sale -- now leaves a chargeable card leg", () => {
		// Naive: apply 450, leaving 38c, which chargeCard rejects outright.
		const plan = planGiftcardLeg({ total: 488, balance: 450 });

		expect(plan.ok).toBe(true);
		expect(plan.cardRemainder).toBe(STRIPE_MIN_CHARGE_CENTS);
		expect(plan.applyAmount).toBe(488 - STRIPE_MIN_CHARGE_CENTS);
		expect(plan.capped).toBe(true);
		// The cap always fits inside what the customer actually has on the card.
		expect(plan.applyAmount).toBeLessThan(450);
		expect(plan.applyAmount + plan.cardRemainder).toBe(488);
	});

	test("a remainder of exactly 1c -- the worst case -- is still rescued", () => {
		const plan = planGiftcardLeg({ total: 1000, balance: 999 });

		expect(plan).toEqual({ ok: true, applyAmount: 949, cardRemainder: 51, capped: true });
	});

	test("a remainder of exactly 51c is already chargeable and is left alone", () => {
		expect(planGiftcardLeg({ total: 1000, balance: 949 })).toEqual({
			ok: true,
			applyAmount: 949,
			cardRemainder: 51,
			capped: false,
		});
	});

	test("a remainder of exactly 50c -- the last rejected amount -- is capped", () => {
		expect(planGiftcardLeg({ total: 1000, balance: 950 }).capped).toBe(true);
		expect(planGiftcardLeg({ total: 1000, balance: 950 }).cardRemainder).toBe(51);
	});

	test("every partial split of a $10 sale leaves either nothing or a chargeable amount on the card", () => {
		for (let balance = 1; balance <= 1000; balance++) {
			const plan = planGiftcardLeg({ total: 1000, balance });
			expect(plan.ok).toBe(true);
			expect(plan.applyAmount).toBeLessThanOrEqual(balance);
			expect(plan.applyAmount + plan.cardRemainder).toBe(1000);
			if (plan.cardRemainder > 0) {
				expect(plan.cardRemainder).toBeGreaterThanOrEqual(STRIPE_MIN_CHARGE_CENTS);
			}
		}
	});

	test("a sale too small to leave a chargeable remainder is refused BEFORE the card is debited", () => {
		// 40c sale, 20c card: no split exists, because even the whole sale is under the
		// minimum. The exit has to be cash, and the giftcard must be untouched to allow it.
		const plan = planGiftcardLeg({ total: 40, balance: 20 });

		expect(plan.ok).toBe(false);
		expect(plan.applyAmount).toBeUndefined();
		expect(plan.error).toMatch(/has NOT been used/);
		expect(plan.error).toMatch(/cash/);
		expect(plan.error).toMatch(/\$0\.40/); // the amount to take in cash
	});

	test("a 51c sale the card cannot cover is refused rather than silently ignoring the giftcard", () => {
		// Capping here would compute an apply amount of 0 -- a meaningless leg.
		expect(planGiftcardLeg({ total: 51, balance: 50 }).ok).toBe(false);
		// One cent more of sale and a real split exists again.
		expect(planGiftcardLeg({ total: 52, balance: 50 })).toEqual({
			ok: true,
			applyAmount: 1,
			cardRemainder: 51,
			capped: true,
		});
	});

	test("a spent giftcard is refused with its own message instead of a zero-amount leg", () => {
		const plan = planGiftcardLeg({ total: 1000, balance: 0 });

		expect(plan.ok).toBe(false);
		expect(plan.error).toMatch(/no balance left/);
	});
});
