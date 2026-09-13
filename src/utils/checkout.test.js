jest.mock("./splitPayment", () => ({
	...jest.requireActual("./splitPayment"),
	recordPayment: jest.fn(),
}));

import createCheckout from "./checkout";
import { recordPayment } from "./splitPayment";

function makeDeps(overrides = {}) {
	return {
		databases: { createDocument: jest.fn().mockResolvedValue({ $id: "t1" }) },
		config: { databases: { bar: { id: "db1", collections: { transactions: "txns" } } } },
		functions: {},
		uniqueId: jest.fn().mockReturnValue("generated-id"),
		getCart: jest.fn().mockReturnValue([{ $id: "beer", quantity: 2 }]),
		getTotal: jest.fn().mockReturnValue(1000),
		getDiscount: jest.fn().mockReturnValue(0),
		getCreatedBy: jest.fn().mockReturnValue("staff-1"),
		getPaymentMethod: jest.fn().mockReturnValue("cash"),
		getGiftcard: jest.fn().mockReturnValue(null),
		setGiftcard: jest.fn(),
		setGiftcardUsage: jest.fn(),
		clearCart: jest.fn(),
		setCheckoutSuccess: jest.fn(),
		setPaymentMethod: jest.fn(),
		transactionIdRef: { current: null },
		setTransactionInProgress: jest.fn(),
		setCheckoutError: jest.fn(),
		setCashModalOpen: jest.fn(),
		handleCardPayment: jest.fn(),
		onSplitStarted: jest.fn(),
		...overrides,
	};
}

describe("checkout", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	test("refuses to proceed without a payment method selector", async () => {
		const deps = makeDeps({ getPaymentMethod: null });
		await createCheckout(deps)();
		expect(deps.setCheckoutError).toHaveBeenCalledWith("Please select a payment method");
		expect(deps.databases.createDocument).not.toHaveBeenCalled();
	});

	test("defaults channel to 'pos' when getChannel isn't provided", async () => {
		const deps = makeDeps({ getPaymentMethod: jest.fn().mockReturnValue("cash") });
		await createCheckout(deps)();

		expect(deps.databases.createDocument).toHaveBeenCalledWith(
			"db1",
			"txns",
			"generated-id",
			expect.objectContaining({ channel: "pos" }),
		);
	});

	test("defaults member_name/member_email to null when not provided", async () => {
		const deps = makeDeps({ getPaymentMethod: jest.fn().mockReturnValue("cash") });
		await createCheckout(deps)();

		expect(deps.databases.createDocument).toHaveBeenCalledWith(
			"db1",
			"txns",
			"generated-id",
			expect.objectContaining({ member_name: null, member_email: null }),
		);
	});

	test("passes through member_name/member_email for a membership-dues payment", async () => {
		const deps = makeDeps({
			getPaymentMethod: jest.fn().mockReturnValue("stripe"),
			getChannel: jest.fn().mockReturnValue("membership"),
			getMemberName: jest.fn().mockReturnValue("Jane Member"),
			getMemberEmail: jest.fn().mockReturnValue("jane@example.com"),
		});
		await createCheckout(deps)();

		expect(deps.databases.createDocument).toHaveBeenCalledWith(
			"db1",
			"txns",
			"generated-id",
			expect.objectContaining({
				channel: "membership",
				member_name: "Jane Member",
				member_email: "jane@example.com",
			}),
		);
	});

	test("defaults bartenderId to null when getBartenderId isn't provided", async () => {
		const deps = makeDeps({ getPaymentMethod: jest.fn().mockReturnValue("cash") });
		await createCheckout(deps)();

		expect(deps.databases.createDocument).toHaveBeenCalledWith(
			"db1",
			"txns",
			"generated-id",
			expect.objectContaining({ bartenderId: null }),
		);
	});

	test("attributes the sale to the logged-in bartender's own row", async () => {
		const deps = makeDeps({
			getPaymentMethod: jest.fn().mockReturnValue("cash"),
			getBartenderId: jest.fn().mockReturnValue("bt1"),
		});
		await createCheckout(deps)();

		expect(deps.databases.createDocument).toHaveBeenCalledWith(
			"db1",
			"txns",
			"generated-id",
			expect.objectContaining({ bartenderId: "bt1" }),
		);
	});

	test("passes through channel:'self_checkout' when getChannel returns it", async () => {
		const deps = makeDeps({
			getPaymentMethod: jest.fn().mockReturnValue("stripe"),
			getChannel: jest.fn().mockReturnValue("self_checkout"),
		});
		await createCheckout(deps)();

		expect(deps.databases.createDocument).toHaveBeenCalledWith(
			"db1",
			"txns",
			"generated-id",
			expect.objectContaining({ channel: "self_checkout" }),
		);
	});

	test("cash: creates a pending transaction and opens the cash modal", async () => {
		const deps = makeDeps({ getPaymentMethod: jest.fn().mockReturnValue("cash") });
		await createCheckout(deps)();

		expect(deps.databases.createDocument).toHaveBeenCalledWith(
			"db1",
			"txns",
			"generated-id",
			expect.objectContaining({ payment_method: "cash", status: "pending", payment_due: 1000 }),
		);
		expect(deps.transactionIdRef.current).toBe("t1");
		expect(deps.setCashModalOpen).toHaveBeenCalledWith(true);
		expect(deps.setTransactionInProgress).toHaveBeenCalledWith(false);
	});

	test("split: hands off to the split payment panel instead of recording anything itself", async () => {
		const deps = makeDeps({ getPaymentMethod: jest.fn().mockReturnValue("split") });
		await createCheckout(deps)();

		expect(deps.onSplitStarted).toHaveBeenCalledWith("t1", 1000);
		expect(recordPayment).not.toHaveBeenCalled();
		expect(deps.setCashModalOpen).not.toHaveBeenCalled();
	});

	test("stripe: delegates straight to handleCardPayment", async () => {
		const deps = makeDeps({ getPaymentMethod: jest.fn().mockReturnValue("stripe") });
		await createCheckout(deps)();

		expect(deps.handleCardPayment).toHaveBeenCalledWith("t1");
	});

	test("giftcard: errors out up front when no giftcard is loaded", async () => {
		const deps = makeDeps({ getPaymentMethod: jest.fn().mockReturnValue("giftcard"), getGiftcard: jest.fn().mockReturnValue(null) });
		await createCheckout(deps)();

		expect(deps.setCheckoutError).toHaveBeenCalledWith("No giftcard loaded");
		expect(recordPayment).not.toHaveBeenCalled();
	});

	test("giftcard: fully covers the total -- completes without touching the card", async () => {
		const deps = makeDeps({
			getPaymentMethod: jest.fn().mockReturnValue("giftcard"),
			getGiftcard: jest.fn().mockReturnValue({ $id: "gc1", balance: 5000 }),
		});
		recordPayment.mockResolvedValue({ ok: true, remaining: 0 });

		await createCheckout(deps)();

		expect(recordPayment).toHaveBeenCalledWith({
			functions: deps.functions,
			transactionId: "t1",
			method: "giftcard",
			amount: 1000,
			giftcardId: "gc1",
		});
		expect(deps.setGiftcard).toHaveBeenCalledWith(null);
		expect(deps.clearCart).toHaveBeenCalled();
		expect(deps.setCheckoutSuccess).toHaveBeenCalledWith(true);
		expect(deps.handleCardPayment).not.toHaveBeenCalled();
	});

	test("giftcard: applies only up to its own balance, then charges the remainder on card", async () => {
		const deps = makeDeps({
			getPaymentMethod: jest.fn().mockReturnValue("giftcard"),
			getGiftcard: jest.fn().mockReturnValue({ $id: "gc1", balance: 400 }),
			getTotal: jest.fn().mockReturnValue(1000),
		});
		recordPayment.mockResolvedValue({ ok: true, remaining: 600 });
		deps.handleCardPayment.mockResolvedValue({ id: "pi_1" });

		await createCheckout(deps)();

		expect(recordPayment).toHaveBeenCalledWith(expect.objectContaining({ amount: 400, method: "giftcard" }));
		expect(deps.handleCardPayment).toHaveBeenCalledWith("t1", false, 600);
		expect(deps.setGiftcard).toHaveBeenCalledWith(null);
	});

	test("giftcard: records the applied/remaining split via setGiftcardUsage (instead of it being discarded) before the card leg runs", async () => {
		const deps = makeDeps({
			getPaymentMethod: jest.fn().mockReturnValue("giftcard"),
			getGiftcard: jest.fn().mockReturnValue({ $id: "gc1", balance: 400 }),
			getTotal: jest.fn().mockReturnValue(1000),
		});
		recordPayment.mockResolvedValue({ ok: true, remaining: 600 });
		deps.handleCardPayment.mockResolvedValue(undefined); // card leg fails

		await createCheckout(deps)();

		// setGiftcardUsage must reflect the real remaining balance BEFORE handleCardPayment is
		// invoked -- this is what lets a retry (see retryCheckout.js) charge the correct
		// remainder instead of recomputing from the full cart total.
		expect(deps.setGiftcardUsage).toHaveBeenCalledWith({ applied: 400, remaining: 600 });
		// card leg failed -- handleCardPayment already reported its own error, giftcard usage
		// must NOT be cleared (the giftcard leg is still valid and unretried)
		expect(deps.setGiftcardUsage).not.toHaveBeenCalledWith(null);
		expect(deps.setGiftcard).not.toHaveBeenCalledWith(null);
	});

	test("giftcard partial + card handler throwing unexpectedly: still surfaces an error instead of leaving the UI stuck with no message", async () => {
		const deps = makeDeps({
			getPaymentMethod: jest.fn().mockReturnValue("giftcard"),
			getGiftcard: jest.fn().mockReturnValue({ $id: "gc1", balance: 400 }),
			getTotal: jest.fn().mockReturnValue(1000),
		});
		recordPayment.mockResolvedValue({ ok: true, remaining: 600 });
		deps.handleCardPayment.mockRejectedValue(new Error("boom"));

		await createCheckout(deps)();

		expect(deps.setCheckoutError).toHaveBeenCalledWith("boom");
		expect(deps.setTransactionInProgress).toHaveBeenCalledWith(false);
	});

	test("giftcard: a clean apply failure surfaces the server's real error and never touches the card", async () => {
		const deps = makeDeps({
			getPaymentMethod: jest.fn().mockReturnValue("giftcard"),
			getGiftcard: jest.fn().mockReturnValue({ $id: "gc1", balance: 400 }),
		});
		recordPayment.mockResolvedValue({ ok: false, error: "giftcard balance changed" });

		await createCheckout(deps)();

		// The specific reason (e.g. a DJ voucher's "wrong event"/"revoked"/"can't combine with a
		// discount" rejection) must reach the cashier, not a generic fallback -- this is what
		// makes those rejections visible at the main checkout path.
		expect(deps.setCheckoutError).toHaveBeenCalledWith("giftcard balance changed");
		expect(deps.handleCardPayment).not.toHaveBeenCalled();
	});

	test("giftcard: falls back to a generic message if the server error has no message", async () => {
		const deps = makeDeps({
			getPaymentMethod: jest.fn().mockReturnValue("giftcard"),
			getGiftcard: jest.fn().mockReturnValue({ $id: "gc1", balance: 400 }),
		});
		recordPayment.mockResolvedValue({ ok: false });

		await createCheckout(deps)();

		expect(deps.setCheckoutError).toHaveBeenCalledWith("Failed to apply giftcard");
	});

	test("surfaces an error and rethrows when creating the transaction document fails", async () => {
		const deps = makeDeps({
			databases: { createDocument: jest.fn().mockRejectedValue(new Error("db down")) },
		});

		await expect(createCheckout(deps)()).rejects.toThrow("db down");
		expect(deps.setCheckoutError).toHaveBeenCalledWith("Failed to create transaction");
		expect(deps.setTransactionInProgress).toHaveBeenCalledWith(false);
	});
});

/**
 * P2-24. The giftcard flow has no cash branch: once the giftcard leg is recorded, the only way
 * to finish the sale is the card, and the reader refuses anything at or under 50c. A remainder
 * in that window therefore wedged the sale with the customer's card already debited, and the
 * only button left (Close) cancelled the sale and credited the card back.
 */
describe("checkout: giftcard remainders below the card minimum", () => {
	beforeEach(() => jest.clearAllMocks());

	test("caps the giftcard leg so the card remainder is chargeable", async () => {
		// The reported case: $6.50 cart with the 25% member discount = 488c, $4.50 on the card.
		const deps = makeDeps({
			getPaymentMethod: jest.fn().mockReturnValue("giftcard"),
			getGiftcard: jest.fn().mockReturnValue({ $id: "gc1", balance: 450 }),
			getTotal: jest.fn().mockReturnValue(488),
		});
		recordPayment.mockResolvedValue({ ok: true, remaining: 51 });
		deps.handleCardPayment.mockResolvedValue({ id: "pi_1" });

		await createCheckout(deps)();

		// 437, not 450 -- 13c stays on the customer's card so the card leg clears 50c.
		expect(recordPayment).toHaveBeenCalledWith(expect.objectContaining({ method: "giftcard", amount: 437 }));
		expect(deps.handleCardPayment).toHaveBeenCalledWith("t1", false, 51);
		expect(deps.setCheckoutError).not.toHaveBeenCalled();
	});

	test("refuses before debiting the card when the sale is too small to split at all", async () => {
		const deps = makeDeps({
			getPaymentMethod: jest.fn().mockReturnValue("giftcard"),
			getGiftcard: jest.fn().mockReturnValue({ $id: "gc1", balance: 20 }),
			getTotal: jest.fn().mockReturnValue(40),
		});

		await createCheckout(deps)();

		// Nothing recorded: the giftcard is still worth $0.20 and the cashier can take the 40c
		// in cash. Debiting first and failing on the card leg is what stranded the sale.
		expect(recordPayment).not.toHaveBeenCalled();
		expect(deps.handleCardPayment).not.toHaveBeenCalled();
		expect(deps.setCheckoutError).toHaveBeenCalledWith(expect.stringMatching(/card minimum/));
		expect(deps.setTransactionInProgress).toHaveBeenLastCalledWith(false);
	});

	test("a comfortable remainder is untouched -- the whole balance is still applied", async () => {
		const deps = makeDeps({
			getPaymentMethod: jest.fn().mockReturnValue("giftcard"),
			getGiftcard: jest.fn().mockReturnValue({ $id: "gc1", balance: 400 }),
			getTotal: jest.fn().mockReturnValue(1000),
		});
		recordPayment.mockResolvedValue({ ok: true, remaining: 600 });
		deps.handleCardPayment.mockResolvedValue({ id: "pi_1" });

		await createCheckout(deps)();

		expect(recordPayment).toHaveBeenCalledWith(expect.objectContaining({ method: "giftcard", amount: 400 }));
	});
});

/**
 * P2-25. `changeDue` was set only by the cash path and cleared only by the SuccessModal's Close
 * button, so dismissing that modal any other way (backdrop tap, Escape) left it set and the
 * NEXT sale's success modal showed a change amount for a card payment.
 */
describe("checkout: change due from the previous sale", () => {
	beforeEach(() => jest.clearAllMocks());

	test.each(["cash", "stripe", "giftcard", "split"])(
		"clears it at the start of a %s sale, before anything can display it",
		async (method) => {
			const deps = makeDeps({
				getPaymentMethod: jest.fn().mockReturnValue(method),
				getGiftcard: jest.fn().mockReturnValue({ $id: "gc1", balance: 5000 }),
				setChangeDue: jest.fn(),
			});
			recordPayment.mockResolvedValue({ ok: true, remaining: 0 });

			await createCheckout(deps)();

			expect(deps.setChangeDue).toHaveBeenCalledWith(0);
		},
	);

	test("clears it even when the transaction itself fails to create", async () => {
		const deps = makeDeps({
			getPaymentMethod: jest.fn().mockReturnValue("cash"),
			setChangeDue: jest.fn(),
			databases: { createDocument: jest.fn().mockRejectedValue(new Error("db down")) },
		});

		await expect(createCheckout(deps)()).rejects.toThrow("db down");

		expect(deps.setChangeDue).toHaveBeenCalledWith(0);
	});
});
