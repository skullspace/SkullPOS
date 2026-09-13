import {
	recordPayment,
	recordPaymentWithRetry,
	RecordPaymentUnknownError,
	describeUnknownPaymentFailure,
	describeCleanLegFailure,
	derivePaymentLegs,
} from "./splitPayment";
import { PAYMENT_LEG_FIXTURES } from "./paymentLegs.fixtures";

function makeFunctionsClient(responseBody) {
	return { createExecution: jest.fn().mockResolvedValue({ responseBody: JSON.stringify(responseBody) }) };
}

describe("recordPayment", () => {
	test("posts the leg details to Transaction-RecordPayment and parses the response", async () => {
		const functions = makeFunctionsClient({ ok: true, remaining: 0, status: "complete" });

		const result = await recordPayment({
			functions,
			transactionId: "t1",
			method: "cash",
			amount: 1000,
		});

		expect(result).toEqual({ ok: true, remaining: 0, status: "complete" });
		// Updated: the body now also carries a `legId`. It used to assert the exact
		// legId-less body, which encoded the assumption that the server could recognise
		// a replayed leg from the transaction's own state alone -- it can't, on a
		// part-paid split sale.
		const [call] = functions.createExecution.mock.calls;
		expect(call[0].functionId).toBe("6a9c728a297df71f5919");
		expect(JSON.parse(call[0].body)).toEqual({
			transactionId: "t1",
			method: "cash",
			amount: 1000,
			legId: expect.any(String),
		});
	});

	test("generates a legId when the caller doesn't supply one, and passes a supplied one through", async () => {
		const functions = makeFunctionsClient({ ok: true, remaining: 0, status: "complete" });

		await recordPayment({ functions, transactionId: "t1", method: "cash", amount: 100 });
		await recordPayment({ functions, transactionId: "t1", method: "cash", amount: 100, legId: "leg-fixed" });

		const [generated, supplied] = functions.createExecution.mock.calls.map((c) => JSON.parse(c[0].body).legId);
		expect(generated).toEqual(expect.any(String));
		expect(generated.length).toBeGreaterThan(0);
		expect(supplied).toBe("leg-fixed");
	});

	test("returns an empty object when the response body is missing", async () => {
		const functions = { createExecution: jest.fn().mockResolvedValue({}) };

		const result = await recordPayment({ functions, transactionId: "t1", method: "cash", amount: 100 });

		expect(result).toEqual({});
	});
});

describe("recordPaymentWithRetry", () => {
	test("returns immediately on a first-try success, no retries", async () => {
		const functions = makeFunctionsClient({ ok: true, remaining: 0, status: "complete" });

		const result = await recordPaymentWithRetry({ functions, transactionId: "t1", method: "cash", amount: 100 });

		expect(result.ok).toBe(true);
		expect(functions.createExecution).toHaveBeenCalledTimes(1);
	});

	test("does NOT retry a clean {ok:false} response -- a real validation failure won't fix itself", async () => {
		const functions = makeFunctionsClient({ ok: false, error: "amount exceeds remaining balance" });

		const result = await recordPaymentWithRetry(
			{ functions, transactionId: "t1", method: "cash", amount: 999999 },
			{ delayMs: 1 },
		);

		expect(result).toEqual({ ok: false, error: "amount exceeds remaining balance" });
		expect(functions.createExecution).toHaveBeenCalledTimes(1);
	});

	test("retries on a thrown transport error and succeeds on a later attempt", async () => {
		const functions = {
			createExecution: jest
				.fn()
				.mockRejectedValueOnce(new Error("network down"))
				.mockResolvedValueOnce({ responseBody: JSON.stringify({ ok: true, remaining: 0, status: "complete" }) }),
		};

		const result = await recordPaymentWithRetry(
			{ functions, transactionId: "t1", method: "cash", amount: 100 },
			{ attempts: 3, delayMs: 1 },
		);

		expect(result.ok).toBe(true);
		expect(functions.createExecution).toHaveBeenCalledTimes(2);
	});

	test("throws RecordPaymentUnknownError carrying the leg details when every attempt throws", async () => {
		const functions = { createExecution: jest.fn().mockRejectedValue(new Error("network down")) };

		await expect(
			recordPaymentWithRetry(
				{ functions, transactionId: "t1", method: "stripe", amount: 1500, paymentIntentId: "pi_1" },
				{ attempts: 3, delayMs: 1 },
			),
		).rejects.toMatchObject({
			name: "RecordPaymentUnknownError",
			method: "stripe",
			amount: 1500,
			paymentIntentId: "pi_1",
		});
		expect(functions.createExecution).toHaveBeenCalledTimes(3);
	});

	test("every retry re-sends the SAME legId so the server can recognise a replay", async () => {
		// The retry exists for the case where the server committed the leg and the
		// response never came back. A part-paid split sale is still "pending" with room
		// left under payment_due, so nothing about the transaction's own state would
		// stop a second identical leg being appended -- only this key would.
		const functions = {
			createExecution: jest
				.fn()
				.mockRejectedValueOnce(new Error("network down"))
				.mockRejectedValueOnce(new Error("network down"))
				.mockResolvedValueOnce({ responseBody: JSON.stringify({ ok: true, remaining: 3000, status: "pending" }) }),
		};

		await recordPaymentWithRetry(
			{ functions, transactionId: "t1", method: "stripe", amount: 2000, paymentIntentId: "pi_1" },
			{ attempts: 3, delayMs: 1 },
		);

		const legIds = functions.createExecution.mock.calls.map((c) => JSON.parse(c[0].body).legId);
		expect(legIds).toHaveLength(3);
		expect(legIds[0]).toEqual(expect.any(String));
		expect(new Set(legIds).size).toBe(1);
	});

	test("two separate legs on the same sale get different legIds", async () => {
		const functions = makeFunctionsClient({ ok: true, remaining: 1000, status: "pending" });

		await recordPaymentWithRetry({ functions, transactionId: "t1", method: "cash", amount: 1000 });
		await recordPaymentWithRetry({ functions, transactionId: "t1", method: "cash", amount: 1000 });

		const legIds = functions.createExecution.mock.calls.map((c) => JSON.parse(c[0].body).legId);
		expect(new Set(legIds).size).toBe(2);
	});

	test("the unknown-state error carries the legId, so a manual reconcile can match it", async () => {
		const functions = { createExecution: jest.fn().mockRejectedValue(new Error("network down")) };

		await expect(
			recordPaymentWithRetry({ functions, transactionId: "t1", method: "giftcard", amount: 400, giftcardId: "gc1" }, { attempts: 2, delayMs: 1 }),
		).rejects.toMatchObject({ name: "RecordPaymentUnknownError", legId: expect.any(String) });
	});
});

describe("describeCleanLegFailure", () => {
	test("a giftcard leg rejected AFTER the server debited it warns the balance may have moved", () => {
		// Transaction-RecordPayment debits the card, then writes the leg in a separate
		// call with no rollback. "Failed to update transaction" is the only clean
		// rejection that happens on the far side of that debit.
		const message = describeCleanLegFailure({
			method: "giftcard",
			amount: 2000,
			error: "Failed to update transaction",
		});
		expect(message).toMatch(/may ALREADY have been reduced by \$20\.00/);
		expect(message).toMatch(/check the card's balance before applying it again/);
	});

	test("every other giftcard rejection happens before the debit and is passed through untouched", () => {
		for (const error of [
			"This voucher has been revoked",
			"This voucher is only valid during its own event",
			"Amount 5000 exceeds giftcard balance 400",
			"Giftcard not found",
		]) {
			expect(describeCleanLegFailure({ method: "giftcard", amount: 2000, error })).toBe(error);
		}
	});

	test("non-giftcard legs are passed through untouched", () => {
		expect(
			describeCleanLegFailure({ method: "stripe", amount: 2000, error: "Failed to update transaction" }),
		).toBe("Failed to update transaction");
		expect(describeCleanLegFailure({ method: "cash", amount: 100, error: "Transaction is not pending" })).toBe(
			"Transaction is not pending",
		);
	});

	test("falls back to a generic message when the server gave none", () => {
		expect(describeCleanLegFailure({ method: "cash", amount: 100 })).toBe("Failed to record payment");
	});
});

describe("describeUnknownPaymentFailure", () => {
	test("stripe: warns not to re-charge the card and names the PaymentIntent", () => {
		const err = new RecordPaymentUnknownError("boom", { method: "stripe", amount: 1500, paymentIntentId: "pi_1" });
		expect(describeUnknownPaymentFailure(err)).toMatch(/do NOT charge this card again/);
		expect(describeUnknownPaymentFailure(err)).toMatch(/pi_1/);
		expect(describeUnknownPaymentFailure(err)).toMatch(/\$15\.00/);
	});

	test("giftcard: warns the balance may already be reduced", () => {
		const err = new RecordPaymentUnknownError("boom", { method: "giftcard", amount: 400, giftcardId: "gc1" });
		expect(describeUnknownPaymentFailure(err)).toMatch(/Giftcard balance may have already been reduced/);
		expect(describeUnknownPaymentFailure(err)).toMatch(/\$4\.00/);
	});

	test("falls back to the raw error message for any other method", () => {
		const err = new RecordPaymentUnknownError("cash leg failed weirdly", { method: "cash", amount: 100 });
		expect(describeUnknownPaymentFailure(err)).toBe("cash leg failed weirdly");
	});
});

/**
 * Driven off the shared fixture table rather than cases written out here, because there are
 * FIVE copies of this function (four Appwrite functions plus this client) and the client one
 * is what the operator reads in the refund confirmation dialog while Stripe-RefundPayment's
 * copy decides what actually reverses. A divergence between them is invisible until someone
 * refunds the wrong amount (P2-29) -- so the case table lives in its own file, meant to be
 * asserted identically by every copy.
 *
 * These cases supersede (and cover) the six that used to be spelled out here. Three of those
 * asserted the pre-fix behaviour on fixtures with no `total` at all: they encoded the very bugs
 * the server copies had already fixed -- a card leg taken straight from `payment_due` (so $0 on
 * any row the retired completion path zeroed) and a cash leg synthesized only when no other leg
 * was found (so a giftcard+card+cash remainder vanished).
 */
describe("derivePaymentLegs (shared fixtures)", () => {
	test.each(PAYMENT_LEG_FIXTURES.map((f) => [f.name, f]))("%s", (_name, fixture) => {
		expect(derivePaymentLegs(fixture.transaction)).toEqual(fixture.legs);
	});

	test("every fixture's legs add up to the transaction total, so nothing is dropped or invented", () => {
		// The property that actually protects the refund dialog: a legacy row's legs must
		// account for the whole sale. Both historical bugs broke exactly this -- the zeroed
		// card leg understated it, the missing cash leg lost the remainder.
		for (const fixture of PAYMENT_LEG_FIXTURES) {
			if (fixture.transaction.payments) continue; // recorded legs are authoritative, not derived
			const summed = fixture.legs.reduce((sum, leg) => sum + leg.amount, 0);
			const total = parseInt(fixture.transaction.total) || 0;
			// An over-applied giftcard is the one case that legitimately exceeds the total.
			expect(summed).toBeGreaterThanOrEqual(total);
			if (summed !== total) {
				expect(fixture.transaction.giftcard_amount).toBeGreaterThan(total);
			}
		}
	});
});
