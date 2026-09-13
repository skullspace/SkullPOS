/**
 * SplitPaymentPanel.test.js
 *
 * The two states where this panel used to lose money: a card charge that went
 * through but wasn't recorded (the button stayed live and a second tap charged
 * the customer again), and "Back to normal checkout" walking away from legs that
 * had already been taken.
 */

jest.mock("../../utils/splitPayment", () => {
	const actual = jest.requireActual("../../utils/splitPayment");
	return { ...actual, recordPaymentWithRetry: jest.fn() };
});
jest.mock("../../utils/transactionStatus", () => ({ setTransactionStatus: jest.fn() }));
jest.mock("../../utils/giftcard", () => ({ findGiftcardByUPC: jest.fn() }));

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SplitPaymentPanel from "./SplitPaymentPanel";
import { recordPaymentWithRetry } from "../../utils/splitPayment";
import { setTransactionStatus } from "../../utils/transactionStatus";

function renderPanel(overrides = {}) {
	const props = {
		transactionId: "txn_1",
		totalAmount: 6000,
		functions: {},
		chargeCard: jest.fn(),
		terminalReady: true,
		onComplete: jest.fn(),
		onCancel: jest.fn(),
		...overrides,
	};
	render(<SplitPaymentPanel {...props} />);
	return props;
}

const click = (name) => userEvent.click(screen.getByRole("button", { name }));

/** Open the Cash method, enter `dollars`, and record it as a leg. */
async function addCashLeg(dollars) {
	await click(/^Cash$/);
	const field = screen.getByLabelText(/Cash amount/);
	await userEvent.clear(field);
	await userEvent.type(field, String(dollars));
	await click(/Add Cash/);
}

describe("card leg", () => {
	beforeEach(() => jest.clearAllMocks());

	test("threads the transactionId into chargeCard so the intent can be recorded", async () => {
		const chargeCard = jest.fn().mockResolvedValue({ id: "pi_1" });
		recordPaymentWithRetry.mockResolvedValue({ ok: true, remaining: 2500 });
		const props = renderPanel({ chargeCard });

		await click(/^Card$/);
		await click(/Charge Card/);

		await waitFor(() => expect(chargeCard).toHaveBeenCalledWith(6000, false, "txn_1"));
		expect(recordPaymentWithRetry).toHaveBeenCalledWith(
			expect.objectContaining({ transactionId: "txn_1", method: "stripe", amount: 6000, paymentIntentId: "pi_1" }),
		);
		expect(props.onComplete).not.toHaveBeenCalled();
	});

	test("charged but NOT recorded: no way to charge again, and the warning names the payment", async () => {
		const chargeCard = jest.fn().mockResolvedValue({ id: "pi_1" });
		// This is the clean-400 path -- which is what a metadata/amount mismatch returns.
		recordPaymentWithRetry.mockResolvedValue({ ok: false, error: "PaymentIntent was not created for this transaction" });
		renderPanel({ chargeCard, totalAmount: 3500 });

		await click(/^Card$/);
		await click(/Charge Card/);

		await waitFor(() => expect(screen.getByText(/The card WAS charged \$35\.00/)).toBeInTheDocument());
		expect(screen.getByText(/Do NOT charge again/)).toBeInTheDocument();
		expect(screen.getByText(/pi_1/)).toBeInTheDocument();

		// The old panel left this button enabled with the amount still filled in.
		expect(screen.queryByRole("button", { name: /Charge Card/ })).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /^Card$/ })).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /^Cash$/ })).not.toBeInTheDocument();
		expect(chargeCard).toHaveBeenCalledTimes(1);
	});

	test("closing after an unconfirmed charge does NOT cancel the transaction", async () => {
		const chargeCard = jest.fn().mockResolvedValue({ id: "pi_1" });
		recordPaymentWithRetry.mockResolvedValue({ ok: false, error: "PaymentIntent was not created for this transaction" });
		const props = renderPanel({ chargeCard });

		await click(/^Card$/);
		await click(/Charge Card/);
		await waitFor(() => expect(screen.getByText(/Do NOT charge again/)).toBeInTheDocument());
		await click(/reconcile manually/);

		// The money moved -- the sale isn't abandoned, it needs reconciling, so it must
		// stay pending and visible in the Transactions view.
		expect(setTransactionStatus).not.toHaveBeenCalled();
		expect(props.onCancel).toHaveBeenCalled();
	});

	test("closing hands the unconfirmed charge UP to the register instead of just dropping the panel", async () => {
		// Dropping the panel on its own leaves the cart behind it populated and Checkout live
		// again -- the cashier who was just told "do NOT charge again" could ring the same cart
		// a second time on card. The register needs the details to latch the till.
		const chargeCard = jest.fn().mockResolvedValue({ id: "pi_1" });
		recordPaymentWithRetry.mockResolvedValue({ ok: false, error: "PaymentIntent was not created for this transaction" });
		const onUnconfirmedCharge = jest.fn();
		const props = renderPanel({ chargeCard, totalAmount: 3500, onUnconfirmedCharge });

		await click(/^Card$/);
		await click(/Charge Card/);
		await waitFor(() => expect(screen.getByText(/Do NOT charge again/)).toBeInTheDocument());
		await click(/reconcile manually/);

		expect(onUnconfirmedCharge).toHaveBeenCalledWith({ amount: 3500, paymentIntentId: "pi_1" });
		// A plain cancel would be wrong here: it is the register's job to decide what happens
		// to the till, and the sale must not be treated as abandoned.
		expect(props.onCancel).not.toHaveBeenCalled();
		expect(setTransactionStatus).not.toHaveBeenCalled();
	});

	test("a charge that failed outright is retryable -- nothing was captured", async () => {
		const chargeCard = jest.fn().mockRejectedValue(new Error("Your card was declined."));
		renderPanel({ chargeCard });

		await click(/^Card$/);
		await click(/Charge Card/);

		await waitFor(() => expect(screen.getByText("Your card was declined.")).toBeInTheDocument());
		expect(recordPaymentWithRetry).not.toHaveBeenCalled();
		expect(screen.getByRole("button", { name: /Charge Card/ })).toBeEnabled();
	});
});

describe("Back to normal checkout", () => {
	beforeEach(() => jest.clearAllMocks());

	test("goes straight back when nothing has been taken yet", async () => {
		const props = renderPanel();

		await click(/Back to normal checkout/);

		expect(props.onCancel).toHaveBeenCalled();
		expect(setTransactionStatus).not.toHaveBeenCalled();
	});

	test("with a recorded leg it confirms first, naming what was already taken", async () => {
		recordPaymentWithRetry.mockResolvedValue({ ok: true, remaining: 4000 });
		const props = renderPanel();

		await addCashLeg(20);
		await waitFor(() => expect(screen.getByText("$40.00 left")).toBeInTheDocument());

		await click(/Back to normal checkout/);

		expect(props.onCancel).not.toHaveBeenCalled();
		expect(screen.getByText(/\$20\.00 Cash has already been taken/)).toBeInTheDocument();
	});

	test("confirming cancels the transaction server-side before the panel closes", async () => {
		recordPaymentWithRetry.mockResolvedValue({ ok: true, remaining: 4000 });
		setTransactionStatus.mockResolvedValue({ ok: true, status: "cancelled" });
		const props = renderPanel();

		await addCashLeg(20);
		await waitFor(() => expect(screen.getByText("$40.00 left")).toBeInTheDocument());
		await click(/Back to normal checkout/);
		await click(/Cancel sale & go back/);

		await waitFor(() =>
			expect(setTransactionStatus).toHaveBeenCalledWith(
				expect.objectContaining({ transactionId: "txn_1", status: "cancelled" }),
			),
		);
		expect(props.onCancel).toHaveBeenCalled();
	});

	test("if the cancel fails the panel stays put rather than silently abandoning the legs", async () => {
		recordPaymentWithRetry.mockResolvedValue({ ok: true, remaining: 4000 });
		setTransactionStatus.mockResolvedValue({ ok: false, error: "Transaction is not pending" });
		const props = renderPanel();

		await addCashLeg(20);
		await waitFor(() => expect(screen.getByText("$40.00 left")).toBeInTheDocument());
		await click(/Back to normal checkout/);
		await click(/Cancel sale & go back/);

		await waitFor(() => expect(screen.getByText(/Transaction is not pending/)).toBeInTheDocument());
		expect(props.onCancel).not.toHaveBeenCalled();
	});

	test("keeping the sale returns to the method buttons with the legs intact", async () => {
		recordPaymentWithRetry.mockResolvedValue({ ok: true, remaining: 4000 });
		const props = renderPanel();

		await addCashLeg(20);
		await waitFor(() => expect(screen.getByText("$40.00 left")).toBeInTheDocument());
		await click(/Back to normal checkout/);
		await click(/Keep this sale/);

		expect(props.onCancel).not.toHaveBeenCalled();
		expect(setTransactionStatus).not.toHaveBeenCalled();
		expect(screen.getByRole("button", { name: /^Cash$/ })).toBeInTheDocument();
		expect(screen.getByText("Cash: $20.00")).toBeInTheDocument();
	});
});

describe("giftcard leg", () => {
	beforeEach(() => jest.clearAllMocks());

	test("a failure AFTER the server already debited the card says so", async () => {
		const { findGiftcardByUPC } = require("../../utils/giftcard");
		findGiftcardByUPC.mockResolvedValue({ $id: "gc1", balance: 5000, eventId: null, active: true });
		// Transaction-RecordPayment debits the giftcard, then fails to write the leg.
		recordPaymentWithRetry.mockResolvedValue({ ok: false, error: "Failed to update transaction" });
		renderPanel();

		await click(/Gift Card/);
		await userEvent.type(screen.getByLabelText(/Gift card code/), "12345");
		await click(/Look Up/);
		await waitFor(() => expect(screen.getByText(/Balance: \$50\.00/)).toBeInTheDocument());
		await click(/Apply Gift Card/);

		await waitFor(() => expect(screen.getByText(/may ALREADY have been reduced by \$50\.00/)).toBeInTheDocument());
	});
});
