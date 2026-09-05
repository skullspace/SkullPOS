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

		expect(deps.chargeCard).toHaveBeenCalledWith(400, false);
		expect(deps.getTotal).not.toHaveBeenCalled();
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
});
