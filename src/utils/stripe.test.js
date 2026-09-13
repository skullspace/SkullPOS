/**
 * stripe.test.js - the POS <-> Appwrite-function seam for a card sale
 *
 * These drive the REAL request bodies, not a stand-in: what stripe.js actually
 * posts to Stripe-CreatePaymentIntent, and what splitPayment.js actually posts to
 * Transaction-RecordPayment for the PaymentIntent that comes back. That seam is
 * where a card sale was being captured and then refused -- the intent carried no
 * `transactionId`, so RecordPayment's metadata guard could never pass -- and it is
 * exactly the join nothing on either side covered.
 */

jest.mock("./api", () => ({ useAppwrite: jest.fn() }));
jest.mock("@stripe/terminal-js", () => ({ loadStripeTerminal: jest.fn() }));

import { act, renderHook, waitFor } from "@testing-library/react";
import { useStripe } from "./stripe";
import { useAppwrite } from "./api";
import { loadStripeTerminal } from "@stripe/terminal-js";
import { recordPayment } from "./splitPayment";

const CREATE_PAYMENT_INTENT_FN = "68f3c860003da00f14d8";
const CANCEL_PAYMENT_INTENT_FN = "68f6272500160b48ee44";
const RECORD_PAYMENT_FN = "6a9c728a297df71f5919";

const intentResponse = (intent) => ({ responseBody: JSON.stringify({ intent }) });

function makeTerminal(overrides = {}) {
	return {
		discoverReaders: jest.fn().mockResolvedValue({ discoveredReaders: [] }),
		collectPaymentMethod: jest.fn(),
		processPayment: jest.fn(),
		cancelCollectPaymentMethod: jest.fn(),
		connectReader: jest.fn(),
		...overrides,
	};
}

async function setup({ createExecution, terminal = makeTerminal() } = {}) {
	const functions = { createExecution: createExecution || jest.fn() };
	useAppwrite.mockReturnValue({
		generateStripeConnectionToken: jest.fn().mockResolvedValue("pst_test"),
		functions,
	});
	loadStripeTerminal.mockResolvedValue({ create: jest.fn(() => terminal) });

	const view = renderHook(() => useStripe());
	// The hook only exposes terminal.current once initializeTerminal has run.
	await waitFor(() => expect(view.result.current.terminal).toBe(terminal));
	return { ...view, terminal, functions };
}

/** A reader that collects and processes cleanly, ending at `paymentIntent`. */
function collectsSuccessfully(paymentIntent) {
	return makeTerminal({
		collectPaymentMethod: jest.fn().mockResolvedValue({ paymentIntent: { id: paymentIntent.id } }),
		processPayment: jest.fn().mockResolvedValue({ paymentIntent }),
	});
}

const bodyOf = (call) => JSON.parse(call[0].body);
const callsTo = (createExecution, functionId) =>
	createExecution.mock.calls.filter((call) => call[0].functionId === functionId);

describe("chargeCard -> Stripe-CreatePaymentIntent request body", () => {
	beforeEach(() => jest.clearAllMocks());

	test("carries the transactionId, so the intent's metadata can be matched at record time", async () => {
		const createExecution = jest.fn().mockResolvedValue(intentResponse({ id: "pi_1", client_secret: "cs_1" }));
		const terminal = collectsSuccessfully({ id: "pi_1", status: "succeeded", amount: 750 });
		const { result } = await setup({ createExecution, terminal });

		await result.current.chargeCard(750, false, "txn_1");

		const [call] = callsTo(createExecution, CREATE_PAYMENT_INTENT_FN);
		expect(bodyOf(call)).toEqual({ test: "test", amount: 750, transactionId: "txn_1" });
	});

	test("refuses to mint an intent with no transactionId instead of taking money it can never record", async () => {
		const createExecution = jest.fn().mockResolvedValue(intentResponse({ id: "pi_1", client_secret: "cs_1" }));
		const terminal = collectsSuccessfully({ id: "pi_1", status: "succeeded", amount: 750 });
		const { result } = await setup({ createExecution, terminal });

		await act(async () => {
			await expect(result.current.chargeCard(750)).rejects.toThrow(/without a transaction id/i);
		});

		expect(callsTo(createExecution, CREATE_PAYMENT_INTENT_FN)).toHaveLength(0);
		expect(terminal.collectPaymentMethod).not.toHaveBeenCalled();
	});

	test("a server error surfaces the server's own message and never reaches the reader", async () => {
		// Appwrite's createExecution resolves normally for a 500, so the error only
		// exists in the response body -- it used to be swallowed and `undefined`
		// handed to collectPaymentMethod as the client secret.
		const createExecution = jest
			.fn()
			.mockResolvedValue({ responseBody: JSON.stringify({ error: "No such payment_intent key" }) });
		const terminal = collectsSuccessfully({ id: "pi_1", status: "succeeded", amount: 750 });
		const { result } = await setup({ createExecution, terminal });

		await act(async () => {
			await expect(result.current.chargeCard(750, false, "txn_1")).rejects.toThrow("No such payment_intent key");
		});
		expect(terminal.collectPaymentMethod).not.toHaveBeenCalled();
	});

	test("a thrown terminal error settles the promise instead of hanging the till", async () => {
		const createExecution = jest.fn().mockResolvedValue(intentResponse({ id: "pi_1", client_secret: "cs_1" }));
		const terminal = makeTerminal({
			collectPaymentMethod: jest.fn().mockRejectedValue(new Error("reader exploded")),
		});
		const { result } = await setup({ createExecution, terminal });

		await expect(result.current.chargeCard(750, false, "txn_1")).rejects.toThrow("reader exploded");
	});

	test("an amount at or below the Stripe minimum is rejected before any intent is created", async () => {
		const createExecution = jest.fn();
		const { result } = await setup({ createExecution });

		await expect(result.current.chargeCard(50, false, "txn_1")).rejects.toThrow(/greater than 50 cents/);
		expect(createExecution).not.toHaveBeenCalled();
	});
});

describe("retrying a card leg", () => {
	beforeEach(() => jest.clearAllMocks());

	test("reuses the same intent when it belongs to the same transaction", async () => {
		const createExecution = jest.fn().mockResolvedValue(intentResponse({ id: "pi_1", client_secret: "cs_1" }));
		const terminal = collectsSuccessfully({ id: "pi_1", status: "succeeded", amount: 750 });
		const { result } = await setup({ createExecution, terminal });

		await result.current.chargeCard(750, false, "txn_1");
		await result.current.chargeCard(750, true, "txn_1");

		expect(callsTo(createExecution, CREATE_PAYMENT_INTENT_FN)).toHaveLength(1);
		expect(terminal.collectPaymentMethod).toHaveBeenNthCalledWith(2, "cs_1", expect.anything());
	});

	test("mints a fresh intent rather than reaching for one from a different transaction", async () => {
		const createExecution = jest
			.fn()
			.mockResolvedValueOnce(intentResponse({ id: "pi_1", client_secret: "cs_1" }))
			.mockResolvedValueOnce(intentResponse({ id: "pi_2", client_secret: "cs_2" }));
		const terminal = collectsSuccessfully({ id: "pi_1", status: "succeeded", amount: 750 });
		const { result } = await setup({ createExecution, terminal });

		await result.current.chargeCard(750, false, "txn_1");
		await result.current.chargeCard(750, true, "txn_2");

		const bodies = callsTo(createExecution, CREATE_PAYMENT_INTENT_FN).map(bodyOf);
		expect(bodies.map((b) => b.transactionId)).toEqual(["txn_1", "txn_2"]);
		expect(terminal.collectPaymentMethod).toHaveBeenNthCalledWith(2, "cs_2", expect.anything());
	});
});

describe("handleCancelStripePayment", () => {
	beforeEach(() => jest.clearAllMocks());

	test("does not cancel an intent that belongs to a different (earlier) transaction", async () => {
		const createExecution = jest.fn().mockResolvedValue(intentResponse({ id: "pi_1", client_secret: "cs_1" }));
		const terminal = collectsSuccessfully({ id: "pi_1", status: "succeeded", amount: 750 });
		const { result } = await setup({ createExecution, terminal });

		await result.current.chargeCard(750, false, "txn_1");
		// A cash/giftcard failure on the NEXT sale runs the same Close handler.
		await act(async () => result.current.handleCancelStripePayment("txn_2"));

		expect(callsTo(createExecution, CANCEL_PAYMENT_INTENT_FN)).toHaveLength(0);
	});

	test("cancels the intent for the transaction it was minted for", async () => {
		const createExecution = jest.fn().mockResolvedValue(intentResponse({ id: "pi_1", client_secret: "cs_1" }));
		const terminal = collectsSuccessfully({ id: "pi_1", status: "succeeded", amount: 750 });
		const { result } = await setup({ createExecution, terminal });

		await result.current.chargeCard(750, false, "txn_1");
		await act(async () => result.current.handleCancelStripePayment("txn_1"));

		// The cancel body MUST name the transaction. CreatePaymentIntent stamps every
		// intent with it now, and Stripe-CancelPaymentIntent refuses a stamped intent
		// whose caller names a DIFFERENT sale -- that is what stops one till cancelling
		// another till's in-flight charge. Omitting it here (which is what shipped, and
		// what 403'd every cancel) silently downgrades the server to identity-only.
		const [call] = callsTo(createExecution, CANCEL_PAYMENT_INTENT_FN);
		expect(bodyOf(call)).toEqual({ test: "test", intent: "pi_1", transactionId: "txn_1" });
	});

	test("names the transaction the intent was minted for even when the caller passes none", async () => {
		const createExecution = jest.fn().mockResolvedValue(intentResponse({ id: "pi_1", client_secret: "cs_1" }));
		const terminal = collectsSuccessfully({ id: "pi_1", status: "succeeded", amount: 750 });
		const { result } = await setup({ createExecution, terminal });

		await result.current.chargeCard(750, false, "txn_1");
		await act(async () => result.current.handleCancelStripePayment());

		const [call] = callsTo(createExecution, CANCEL_PAYMENT_INTENT_FN);
		expect(bodyOf(call).transactionId).toBe("txn_1");
	});
});

describe("the full card contract: what Stripe holds vs what the leg records", () => {
	beforeEach(() => jest.clearAllMocks());

	test("a tipped sale: the intent is base+tip, the recorded leg is the tip-exclusive base", async () => {
		// $7.50 sale, customer adds a $1.00 tip on the reader (which is what
		// update_payment_intent: true exists for), so Stripe's intent is 850.
		const createExecution = jest.fn().mockImplementation(({ functionId }) => {
			if (functionId === CREATE_PAYMENT_INTENT_FN) {
				return Promise.resolve(intentResponse({ id: "pi_tip", client_secret: "cs_tip" }));
			}
			return Promise.resolve({ responseBody: JSON.stringify({ ok: true, remaining: 0, status: "complete" }) });
		});
		const terminal = collectsSuccessfully({
			id: "pi_tip",
			status: "succeeded",
			amount: 850,
			amount_details: { tip: { amount: 100 } },
		});
		const { result, functions } = await setup({ createExecution, terminal });

		const paymentIntent = await result.current.chargeCard(750, false, "txn_tip");
		expect(paymentIntent.amount).toBe(850);

		await recordPayment({
			functions,
			transactionId: "txn_tip",
			method: "stripe",
			amount: 750,
			paymentIntentId: paymentIntent.id,
		});

		const [recordCall] = callsTo(createExecution, RECORD_PAYMENT_FN);
		const body = bodyOf(recordCall);
		expect(body).toMatchObject({
			transactionId: "txn_tip",
			method: "stripe",
			paymentIntentId: "pi_tip",
			// Tip-exclusive: this is what gets subtracted from payment_due. The tip
			// is carried separately on Transactions.tip, derived server-side from
			// the intent's amount_details. Sending 850 here would overshoot
			// payment_due; the server must therefore compare the leg against
			// `paymentIntent.amount - amount_details.tip.amount`, not `amount`.
			amount: 750,
		});
		expect(body.amount).not.toBe(paymentIntent.amount);

		// And the intent that will be looked up server-side is the one stamped with
		// this transaction -- the whole point of threading it through.
		const [intentCall] = callsTo(createExecution, CREATE_PAYMENT_INTENT_FN);
		expect(bodyOf(intentCall).transactionId).toBe(body.transactionId);
	});
});
