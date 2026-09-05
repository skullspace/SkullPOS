import {
	recordPayment,
	recordPaymentWithRetry,
	RecordPaymentUnknownError,
	describeUnknownPaymentFailure,
	derivePaymentLegs,
} from "./splitPayment";

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
		expect(functions.createExecution).toHaveBeenCalledWith({
			functionId: "6a9c728a297df71f5919",
			body: JSON.stringify({
				transactionId: "t1",
				method: "cash",
				amount: 1000,
				giftcardId: undefined,
				paymentIntentId: undefined,
			}),
		});
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

describe("derivePaymentLegs", () => {
	test("uses the payments array directly when present", () => {
		const legs = [
			{ method: "giftcard", amount: 400, giftcardId: "gc1" },
			{ method: "cash", amount: 600 },
		];
		expect(derivePaymentLegs({ payments: JSON.stringify(legs) })).toEqual(legs);
	});

	test("legacy fallback: giftcard + stripe combo with no payments array", () => {
		const transaction = {
			payments: null,
			giftcards: ["gc1"],
			giftcard_amount: 400,
			stripe_id: "pi_1",
			payment_due: 600,
		};
		expect(derivePaymentLegs(transaction)).toEqual([
			{ method: "giftcard", amount: 400, giftcardId: "gc1" },
			{ method: "stripe", amount: 600, stripeId: "pi_1" },
		]);
	});

	test("legacy fallback: giftcard relationship stored as an expanded object", () => {
		const transaction = { giftcards: [{ $id: "gc1", balance: 999 }], giftcard_amount: 400, payment_due: 0 };
		expect(derivePaymentLegs(transaction)).toEqual([{ method: "giftcard", amount: 400, giftcardId: "gc1" }]);
	});

	test("legacy fallback: cash-only transaction (no giftcard, no stripe_id)", () => {
		expect(derivePaymentLegs({ payment_due: 500 })).toEqual([{ method: "cash", amount: 500 }]);
	});

	test("malformed payments JSON falls back to legacy derivation instead of throwing", () => {
		expect(derivePaymentLegs({ payments: "{not valid json", payment_due: 500 })).toEqual([
			{ method: "cash", amount: 500 },
		]);
	});

	test("an empty payments array also falls back to legacy derivation", () => {
		expect(derivePaymentLegs({ payments: "[]", payment_due: 500 })).toEqual([{ method: "cash", amount: 500 }]);
	});
});
