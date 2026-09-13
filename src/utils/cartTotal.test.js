import { computeTotal } from "./cartTotal";

const cart = (...prices) => prices.map((price, i) => ({ $id: `i${i}`, price, quantity: 1 }));

describe("computeTotal", () => {
	test("no discount: total is the subtotal", () => {
		expect(computeTotal(cart(1000, 250), null)).toEqual({ subtotal: 1250, discount: 0, total: 1250 });
	});

	test("an empty cart is 0, with or without a discount applied", () => {
		expect(computeTotal([], null)).toEqual({ subtotal: 0, discount: 0, total: 0 });
		expect(computeTotal([], { type: "cents", amount: 500 })).toEqual({ subtotal: 0, discount: 0, total: 0 });
		expect(computeTotal([], { type: "percent", amount: 25 })).toEqual({ subtotal: 0, discount: 0, total: 0 });
	});

	test("quantities multiply", () => {
		expect(computeTotal([{ price: 350, quantity: 3 }], null).total).toBe(1050);
	});

	describe("percent discounts", () => {
		test("0% takes nothing off", () => {
			expect(computeTotal(cart(4000), { type: "percent", amount: 0 })).toEqual({
				subtotal: 4000,
				discount: 0,
				total: 4000,
			});
		});

		test("the live 25% member discount", () => {
			expect(computeTotal(cart(4000), { type: "percent", amount: 25 })).toEqual({
				subtotal: 4000,
				discount: 1000,
				total: 3000,
			});
		});

		test("100% zeroes the sale but never goes below it", () => {
			expect(computeTotal(cart(4000), { type: "percent", amount: 100 })).toEqual({
				subtotal: 4000,
				discount: 4000,
				total: 0,
			});
		});

		test("over 100% is still clamped to the cart, never a negative total", () => {
			expect(computeTotal(cart(4000), { type: "percent", amount: 150 })).toEqual({
				subtotal: 4000,
				discount: 4000,
				total: 0,
			});
		});

		test("a fractional percent truncates to whole cents", () => {
			// 33% of $10.01 = 330.33 cents
			expect(computeTotal(cart(1001), { type: "percent", amount: 33 }).discount).toBe(330);
		});
	});

	describe("flat (cents) discounts", () => {
		test("the live $1.00 pizza discount", () => {
			expect(computeTotal(cart(1400), { type: "cents", amount: 100 })).toEqual({
				subtotal: 1400,
				discount: 100,
				total: 1300,
			});
		});

		test("a flat amount larger than the cart is clamped to the cart", () => {
			expect(computeTotal(cart(400), { type: "cents", amount: 1000 })).toEqual({
				subtotal: 400,
				discount: 400,
				total: 0,
			});
		});
	});

	describe("rows the console lets an admin save that nothing else would catch", () => {
		test("a NEGATIVE amount must never raise the total", () => {
			// `discounts.amount` is a nullable unbounded int64. A typo (or someone using
			// the row as a surcharge) used to subtract a negative and charge the customer
			// MORE than the cart, with `discount` written negative on the transaction.
			expect(computeTotal(cart(4000), { type: "cents", amount: -500 })).toEqual({
				subtotal: 4000,
				discount: 0,
				total: 4000,
			});
			expect(computeTotal(cart(4000), { type: "percent", amount: -25 })).toEqual({
				subtotal: 4000,
				discount: 0,
				total: 4000,
			});
		});

		test("a missing or unknown `type` applies nothing instead of silently being read as cents", () => {
			// `type` is a non-required enum with no default, so a row saved with
			// `amount: 15` meaning 15 PERCENT arrives with type null. Reading that as
			// cents took 15 cents off a $40 tab and looked like it had worked.
			const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
			try {
				expect(computeTotal(cart(4000), { name: "oops", amount: 15 })).toEqual({
					subtotal: 4000,
					discount: 0,
					total: 4000,
				});
				expect(computeTotal(cart(4000), { name: "oops", type: null, amount: 15 }).discount).toBe(0);
				expect(computeTotal(cart(4000), { name: "oops", type: "dollars", amount: 15 }).discount).toBe(0);
				expect(warn).toHaveBeenCalled();
			} finally {
				warn.mockRestore();
			}
		});

		test("a null amount is treated as no discount, not NaN", () => {
			expect(computeTotal(cart(4000), { type: "cents", amount: null })).toEqual({
				subtotal: 4000,
				discount: 0,
				total: 4000,
			});
			expect(computeTotal(cart(4000), { type: "percent", amount: null }).total).toBe(4000);
		});
	});
});
