jest.mock("./splitPayment", () => ({
	...jest.requireActual("./splitPayment"),
	recordPayment: jest.fn(),
}));

import createRetryCheckout from "./retryCheckout";
import { recordPayment } from "./splitPayment";

function makeDeps(overrides = {}) {
	return {
		transactionIdRef: { current: "t1" },
		getCardChargeUnconfirmed: jest.fn().mockReturnValue(false),
		getPaymentMethod: jest.fn().mockReturnValue("stripe"),
		getGiftcard: jest.fn().mockReturnValue(null),
		getGiftcardUsage: jest.fn().mockReturnValue(null),
		getTotal: jest.fn().mockReturnValue(1000),
		functions: {},
		setGiftcard: jest.fn(),
		setGiftcardUsage: jest.fn(),
		setTransactionInProgress: jest.fn(),
		setCheckoutError: jest.fn(),
		setCheckoutSuccess: jest.fn(),
		setPaymentMethod: jest.fn(),
		setCashModalOpen: jest.fn(),
		clearCart: jest.fn(),
		handleCardPayment: jest.fn(),
		...overrides,
	};
}

// flush any pending microtasks (the giftcard-usage-exists fast path fires an
// unawaited .then() chain instead of an async IIFE)
const flush = async () => {
	for (let i = 0; i < 5; i++) {
		await Promise.resolve();
	}
};

describe("retryCheckout", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	test("refuses to retry when there's no transaction to retry", () => {
		const deps = makeDeps({ transactionIdRef: { current: null } });
		createRetryCheckout(deps)();

		expect(deps.setCheckoutError).toHaveBeenCalledWith("No transaction available to retry");
		expect(deps.handleCardPayment).not.toHaveBeenCalled();
	});

	test("refuses to retry once a card charge is unconfirmed (may have already gone through)", () => {
		const deps = makeDeps({ getCardChargeUnconfirmed: jest.fn().mockReturnValue(true) });
		createRetryCheckout(deps)();

		expect(deps.handleCardPayment).not.toHaveBeenCalled();
		expect(deps.setTransactionInProgress).not.toHaveBeenCalledWith(true);
	});

	test("stripe: re-attempts charging the same transaction", () => {
		const deps = makeDeps({ getPaymentMethod: jest.fn().mockReturnValue("stripe") });
		createRetryCheckout(deps)();

		expect(deps.setTransactionInProgress).toHaveBeenCalledWith(true);
		expect(deps.handleCardPayment).toHaveBeenCalledWith("t1", true);
		expect(recordPayment).not.toHaveBeenCalled();
	});

	test("cash: reopens the cash modal instead of touching the card or giftcard", () => {
		const deps = makeDeps({ getPaymentMethod: jest.fn().mockReturnValue("cash") });
		createRetryCheckout(deps)();

		expect(deps.setCashModalOpen).toHaveBeenCalledWith(true);
		expect(deps.setTransactionInProgress).toHaveBeenCalledWith(false);
		expect(deps.handleCardPayment).not.toHaveBeenCalled();
	});

	describe("giftcard partially applied, then the card leg failed (the regression case)", () => {
		function partialUsageDeps(overrides = {}) {
			return makeDeps({
				getPaymentMethod: jest.fn().mockReturnValue("giftcard"),
				// giftcard's own balance is 5000 and the cart total is 1000 -- both stale/
				// irrelevant here, since the giftcard leg already succeeded for 400 and only
				// 600 is still owed on the card.
				getGiftcard: jest.fn().mockReturnValue({ $id: "gc1", balance: 5000 }),
				getGiftcardUsage: jest.fn().mockReturnValue({ applied: 400, remaining: 600 }),
				getTotal: jest.fn().mockReturnValue(1000),
				...overrides,
			});
		}

		test("retries the card for the actual remaining amount, and never re-applies the giftcard", async () => {
			const deps = partialUsageDeps();
			deps.handleCardPayment.mockResolvedValue({ id: "pi_2" });

			createRetryCheckout(deps)();
			await flush();

			expect(recordPayment).not.toHaveBeenCalled();
			expect(deps.handleCardPayment).toHaveBeenCalledWith("t1", true, 600);
			expect(deps.handleCardPayment).not.toHaveBeenCalledWith("t1", true, 1000);
		});

		test("on a successful card retry, clears the giftcard so it can't be applied again", async () => {
			const deps = partialUsageDeps();
			deps.handleCardPayment.mockResolvedValue({ id: "pi_2" });

			createRetryCheckout(deps)();
			await flush();

			expect(deps.setGiftcard).toHaveBeenCalledWith(null);
			expect(deps.setGiftcardUsage).toHaveBeenCalledWith(null);
		});

		test("when the card retry fails again, leaves the giftcard usage alone so a further retry still uses the right remainder", async () => {
			const deps = partialUsageDeps();
			// handleCardPayment already handles/reports its own failure and resolves falsy
			deps.handleCardPayment.mockResolvedValue(undefined);

			createRetryCheckout(deps)();
			await flush();

			expect(deps.setGiftcard).not.toHaveBeenCalled();
			expect(deps.setGiftcardUsage).not.toHaveBeenCalled();
		});
	});

	describe("giftcard: nothing applied yet (the original apply itself failed)", () => {
		function freshApplyDeps(overrides = {}) {
			return makeDeps({
				getPaymentMethod: jest.fn().mockReturnValue("giftcard"),
				getGiftcard: jest.fn().mockReturnValue({ $id: "gc1", balance: 400 }),
				getGiftcardUsage: jest.fn().mockReturnValue(null),
				getTotal: jest.fn().mockReturnValue(1000),
				...overrides,
			});
		}

		test("errors out when no giftcard is loaded to retry with", async () => {
			const deps = freshApplyDeps({ getGiftcard: jest.fn().mockReturnValue(null) });

			createRetryCheckout(deps)();
			await flush();

			expect(deps.setCheckoutError).toHaveBeenCalledWith("No giftcard loaded");
			expect(recordPayment).not.toHaveBeenCalled();
		});

		test("applies up to the giftcard's own balance, then charges the remainder on card", async () => {
			const deps = freshApplyDeps();
			recordPayment.mockResolvedValue({ ok: true, remaining: 600 });
			deps.handleCardPayment.mockResolvedValue({ id: "pi_3" });

			createRetryCheckout(deps)();
			await flush();

			expect(recordPayment).toHaveBeenCalledWith({
				functions: deps.functions,
				transactionId: "t1",
				method: "giftcard",
				amount: 400,
				giftcardId: "gc1",
			});
			expect(deps.setGiftcardUsage).toHaveBeenCalledWith({ applied: 400, remaining: 600 });
			expect(deps.handleCardPayment).toHaveBeenCalledWith("t1", true, 600);
		});

		test("fully covers the total: completes without touching the card", async () => {
			const deps = freshApplyDeps({ getGiftcard: jest.fn().mockReturnValue({ $id: "gc1", balance: 5000 }) });
			recordPayment.mockResolvedValue({ ok: true, remaining: 0 });

			createRetryCheckout(deps)();
			await flush();

			expect(deps.handleCardPayment).not.toHaveBeenCalled();
			expect(deps.setGiftcard).toHaveBeenCalledWith(null);
			expect(deps.setGiftcardUsage).toHaveBeenCalledWith(null);
			expect(deps.clearCart).toHaveBeenCalled();
			expect(deps.setCheckoutSuccess).toHaveBeenCalledWith(true);
		});

		test("a clean apply failure surfaces an error and never touches the card", async () => {
			const deps = freshApplyDeps();
			recordPayment.mockResolvedValue({ ok: false, error: "giftcard balance changed" });

			createRetryCheckout(deps)();
			await flush();

			// Updated: this used to assert the fixed string "Failed to retry giftcard",
			// which threw away the server's actual reason -- including the one that says
			// the giftcard may already have been debited. checkout.js's equivalent test
			// already asserted the opposite for the first attempt; these now agree.
			expect(deps.setCheckoutError).toHaveBeenCalledWith("giftcard balance changed");
			expect(deps.handleCardPayment).not.toHaveBeenCalled();
		});
	});
});

/**
 * P2-24. Retry took the identical branch to the first attempt, so it recomputed the same
 * min(balance, total) split and failed the same way -- there was no path out of a giftcard sale
 * whose remainder fell under the card minimum.
 */
describe("retryCheckout: giftcard remainders below the card minimum", () => {
	beforeEach(() => jest.clearAllMocks());

	test("a from-scratch giftcard retry caps the leg so the card remainder is chargeable", async () => {
		const deps = makeDeps({
			getPaymentMethod: jest.fn().mockReturnValue("giftcard"),
			getGiftcard: jest.fn().mockReturnValue({ $id: "gc1", balance: 450 }),
			getGiftcardUsage: jest.fn().mockReturnValue(null),
			getTotal: jest.fn().mockReturnValue(488),
		});
		recordPayment.mockResolvedValue({ ok: true, remaining: 51 });
		deps.handleCardPayment.mockResolvedValue({ id: "pi_1" });

		createRetryCheckout(deps)();
		await flush();

		expect(recordPayment).toHaveBeenCalledWith(expect.objectContaining({ method: "giftcard", amount: 437 }));
		expect(deps.handleCardPayment).toHaveBeenCalledWith("t1", true, 51);
	});

	test("a from-scratch giftcard retry on an unsplittable sale refuses instead of debiting the card", async () => {
		const deps = makeDeps({
			getPaymentMethod: jest.fn().mockReturnValue("giftcard"),
			getGiftcard: jest.fn().mockReturnValue({ $id: "gc1", balance: 20 }),
			getGiftcardUsage: jest.fn().mockReturnValue(null),
			getTotal: jest.fn().mockReturnValue(40),
		});

		createRetryCheckout(deps)();
		await flush();

		expect(recordPayment).not.toHaveBeenCalled();
		expect(deps.handleCardPayment).not.toHaveBeenCalled();
		expect(deps.setCheckoutError).toHaveBeenCalledWith(expect.stringMatching(/card minimum/));
		expect(deps.setTransactionInProgress).toHaveBeenLastCalledWith(false);
	});

	test("an already-applied giftcard leg is still retried at the server's own remaining amount", async () => {
		// The cap only applies where the leg has NOT been recorded yet. Once it has, the
		// server's `remaining` is the truth and recomputing anything would double-apply.
		const deps = makeDeps({
			getPaymentMethod: jest.fn().mockReturnValue("giftcard"),
			getGiftcard: jest.fn().mockReturnValue({ $id: "gc1", balance: 0 }),
			getGiftcardUsage: jest.fn().mockReturnValue({ applied: 437, remaining: 51 }),
			getTotal: jest.fn().mockReturnValue(488),
		});
		deps.handleCardPayment.mockResolvedValue({ id: "pi_1" });

		createRetryCheckout(deps)();
		await flush();

		expect(recordPayment).not.toHaveBeenCalled();
		expect(deps.handleCardPayment).toHaveBeenCalledWith("t1", true, 51);
	});
});
