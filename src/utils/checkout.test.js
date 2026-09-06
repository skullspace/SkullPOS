jest.mock("./splitPayment", () => ({
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

	test("giftcard: a clean apply failure surfaces an error and never touches the card", async () => {
		const deps = makeDeps({
			getPaymentMethod: jest.fn().mockReturnValue("giftcard"),
			getGiftcard: jest.fn().mockReturnValue({ $id: "gc1", balance: 400 }),
		});
		recordPayment.mockResolvedValue({ ok: false, error: "giftcard balance changed" });

		await createCheckout(deps)();

		expect(deps.setCheckoutError).toHaveBeenCalledWith("Failed to apply giftcard");
		expect(deps.handleCardPayment).not.toHaveBeenCalled();
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
