jest.mock("./splitPayment", () => ({
	recordPaymentWithRetry: jest.fn(),
	describeUnknownPaymentFailure: jest.fn(),
}));

import createHandleCardPayment from "./handleCardPayment";
import { recordPaymentWithRetry, describeUnknownPaymentFailure } from "./splitPayment";

function makeDeps(overrides = {}) {
	return {
		chargeCard: jest.fn(),
		terminal: {},
		functions: {},
		setStripeAlert: jest.fn(),
		setTransactionInProgress: jest.fn(),
		setCheckoutError: jest.fn(),
		setCheckoutSuccess: jest.fn(),
		setCardChargeUnconfirmed: jest.fn(),
		clearCart: jest.fn(),
		setPaymentMethod: jest.fn(),
		formatCAD: (cents) => `$${(cents / 100).toFixed(2)}`,
		getTotal: jest.fn().mockReturnValue(1000),
		...overrides,
	};
}

describe("handleCardPayment", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	test("refuses to charge when the terminal isn't connected", async () => {
		const deps = makeDeps({ terminal: null });
		const handler = createHandleCardPayment(deps);

		await handler("t1");

		expect(deps.chargeCard).not.toHaveBeenCalled();
		expect(deps.setCheckoutError).toHaveBeenCalledWith("Stripe terminal not connected");
	});

	test("a full success clears the cart and shows the success alert", async () => {
		const deps = makeDeps({ chargeCard: jest.fn().mockResolvedValue({ id: "pi_1", amount: 1000, amount_details: { tip: { amount: 150 } } }) });
		recordPaymentWithRetry.mockResolvedValue({ ok: true, remaining: 0, status: "complete" });
		const handler = createHandleCardPayment(deps);

		const result = await handler("t1");

		expect(result).toEqual({ id: "pi_1", amount: 1000, amount_details: { tip: { amount: 150 } } });
		expect(deps.setCardChargeUnconfirmed).toHaveBeenCalledWith(false);
		expect(deps.setCardChargeUnconfirmed).not.toHaveBeenCalledWith(true);
		expect(deps.setStripeAlert).toHaveBeenCalledWith(
			expect.objectContaining({ type: "success", message: expect.stringContaining("Payment Successful") }),
		);
		expect(deps.setCheckoutSuccess).toHaveBeenCalledWith(true);
		expect(deps.clearCart).toHaveBeenCalled();
		expect(deps.setPaymentMethod).toHaveBeenCalledWith("stripe");
		expect(deps.setCheckoutError).not.toHaveBeenCalled();
	});

	test("uses amountToCharge instead of getTotal when given (partial giftcard remainder)", async () => {
		const deps = makeDeps({ chargeCard: jest.fn().mockResolvedValue({ id: "pi_1", amount: 400 }) });
		recordPaymentWithRetry.mockResolvedValue({ ok: true, remaining: 0, status: "complete" });
		const handler = createHandleCardPayment(deps);

		await handler("t1", false, 400);

		expect(deps.chargeCard).toHaveBeenCalledWith(400, false, "t1");
		expect(deps.getTotal).not.toHaveBeenCalled();
	});

	test("threads the transactionId into chargeCard, on a first attempt and on a retry", async () => {
		// Stripe-CreatePaymentIntent stamps this into the intent's metadata, and
		// Transaction-RecordPayment refuses any stripe leg whose intent doesn't carry
		// it -- by which point the money is already captured. Without it, no card sale
		// can be recorded at all.
		const deps = makeDeps({ chargeCard: jest.fn().mockResolvedValue({ id: "pi_1", amount: 1000 }) });
		recordPaymentWithRetry.mockResolvedValue({ ok: true, remaining: 0, status: "complete" });
		const handler = createHandleCardPayment(deps);

		await handler("txn_abc");
		await handler("txn_abc", true);

		expect(deps.chargeCard).toHaveBeenNthCalledWith(1, 1000, false, "txn_abc");
		expect(deps.chargeCard).toHaveBeenNthCalledWith(2, 1000, true, "txn_abc");
	});

	test("a tipped sale records the TIP-EXCLUSIVE base, not what Stripe captured", async () => {
		// update_payment_intent lets the reader add a tip, so the intent comes back as
		// base + tip. The leg is what gets subtracted from payment_due and must stay the
		// base; the tip travels separately on Transactions.tip. Recording 850 here would
		// overshoot payment_due and be refused.
		const deps = makeDeps({
			getTotal: jest.fn().mockReturnValue(750),
			chargeCard: jest
				.fn()
				.mockResolvedValue({ id: "pi_tip", amount: 850, amount_details: { tip: { amount: 100 } } }),
		});
		recordPaymentWithRetry.mockResolvedValue({ ok: true, remaining: 0, status: "complete" });
		const handler = createHandleCardPayment(deps);

		await handler("txn_tip");

		expect(recordPaymentWithRetry).toHaveBeenCalledWith({
			functions: deps.functions,
			transactionId: "txn_tip",
			method: "stripe",
			amount: 750,
			paymentIntentId: "pi_tip",
		});
		expect(deps.setStripeAlert).toHaveBeenCalledWith(
			expect.objectContaining({ message: "Payment Successful: $8.50 Total: $7.50 + Tip: $1.00" }),
		);
	});

	test("card charged but recording cleanly failed: flags unconfirmed, never claims success", async () => {
		const deps = makeDeps({ chargeCard: jest.fn().mockResolvedValue({ id: "pi_1", amount: 1000 }) });
		recordPaymentWithRetry.mockResolvedValue({ ok: false, error: "leg exceeds remaining balance" });
		const handler = createHandleCardPayment(deps);

		await handler("t1");

		expect(deps.setCardChargeUnconfirmed).toHaveBeenCalledWith(true);
		expect(deps.setCheckoutError).toHaveBeenCalledWith(expect.stringContaining("Card was charged $10.00 but failed to save"));
		expect(deps.setCheckoutError).toHaveBeenCalledWith(expect.stringContaining("pi_1"));
		expect(deps.setCheckoutSuccess).not.toHaveBeenCalled();
		expect(deps.clearCart).not.toHaveBeenCalled();
		expect(deps.setStripeAlert).not.toHaveBeenCalled();
	});

	test("card charged but every recording attempt threw (unknown state): uses the tailored unknown-failure message", async () => {
		const deps = makeDeps({ chargeCard: jest.fn().mockResolvedValue({ id: "pi_1", amount: 1000 }) });
		const unknownError = Object.assign(new Error("network down"), { name: "RecordPaymentUnknownError" });
		recordPaymentWithRetry.mockRejectedValue(unknownError);
		describeUnknownPaymentFailure.mockReturnValue("Card may have been charged -- do NOT charge again.");
		const handler = createHandleCardPayment(deps);

		await handler("t1");

		expect(describeUnknownPaymentFailure).toHaveBeenCalledWith(unknownError);
		expect(deps.setCardChargeUnconfirmed).toHaveBeenCalledWith(true);
		expect(deps.setCheckoutError).toHaveBeenCalledWith("Card may have been charged -- do NOT charge again.");
		expect(deps.setCheckoutSuccess).not.toHaveBeenCalled();
	});

	test("chargeCard itself throwing (e.g. declined) surfaces the error without marking the charge unconfirmed", async () => {
		const deps = makeDeps({
			chargeCard: jest.fn().mockRejectedValue({ code: "card_declined", message: "Your card was declined." }),
		});
		const handler = createHandleCardPayment(deps);

		await handler("t1");

		expect(deps.setTransactionInProgress).toHaveBeenCalledWith(false);
		expect(deps.setCheckoutError).toHaveBeenCalledWith("card_declined\nYour card was declined.");
		expect(recordPaymentWithRetry).not.toHaveBeenCalled();
		expect(deps.setCardChargeUnconfirmed).not.toHaveBeenCalledWith(true);
	});

	test("a plain network/JS error with no .code shows just the message, not a literal 'undefined' prefix", async () => {
		const deps = makeDeps({
			chargeCard: jest.fn().mockRejectedValue(new Error("Network request failed")),
		});
		const handler = createHandleCardPayment(deps);

		await handler("t1");

		expect(deps.setCheckoutError).toHaveBeenCalledWith("Network request failed");
		expect(deps.setCheckoutError).not.toHaveBeenCalledWith(expect.stringContaining("undefined"));
	});

	test("an error with neither .code nor .message falls back to a generic message instead of blank/undefined text", async () => {
		const deps = makeDeps({
			chargeCard: jest.fn().mockRejectedValue({}),
		});
		const handler = createHandleCardPayment(deps);

		await handler("t1");

		expect(deps.setCheckoutError).toHaveBeenCalledWith("Card payment failed");
	});
});
