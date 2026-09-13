/**
 * selfCheckout.test.js
 *
 * The kiosk is card-only: both of its flows (shop cart and membership dues) go through a
 * LOCAL adapter around useStripe's chargeCard that adds a hard payment timeout. That adapter
 * is the thing under test here.
 *
 * P0-1 made `transactionId` a required third argument of chargeCard -- Stripe-CreatePaymentIntent
 * stamps it into the intent's metadata and Transaction-RecordPayment refuses any leg whose intent
 * doesn't carry it. The kiosk's adapter was written as `(amount, retrying) => ...`, which silently
 * dropped that third argument, so getChargeID threw before an intent existed and the kiosk took no
 * payment at all. There was no test file under selfCheckout/ to catch it.
 *
 * The chargeCard stub below therefore behaves like the real one: it REJECTS when no transaction id
 * reaches it, so a two-argument adapter fails these tests rather than quietly passing.
 */

jest.mock("../../utils/api", () => ({ useAppwrite: jest.fn() }));
jest.mock("../../utils/stripe", () => ({ useStripe: jest.fn() }));
jest.mock("../../utils/splitPayment", () => {
	const actual = jest.requireActual("../../utils/splitPayment");
	return { ...actual, recordPaymentWithRetry: jest.fn() };
});
jest.mock("../../utils/receipt", () => ({ emailReceipt: jest.fn().mockResolvedValue({ ok: true }) }));

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SelfCheckout from "./selfCheckout";
import { useAppwrite } from "../../utils/api";
import { useStripe } from "../../utils/stripe";
import { recordPaymentWithRetry } from "../../utils/splitPayment";

const categories = [{ $id: "cat_snacks", name: "Snacks", alcohol: false }];
const items = [{ $id: "item_chips", name: "Chips", price: 1000, categories: "cat_snacks", enabledPOS: true }];

const appwriteConfig = {
	databases: {
		bar: { id: "bar", collections: { transactions: "transactions" } },
		data: { id: "data", collections: { config: "config" } },
	},
};

let chargeCard;
let createDocument;

/**
 * Stands in for stripe.js's chargeCard, including the part that matters: getChargeID throws
 * "Cannot create a Stripe payment intent without a transaction id" when the id is missing, and
 * nothing is ever collected from the reader.
 */
function makeChargeCard() {
	return jest.fn(async (amountCents, retrying, transactionId) => {
		if (!transactionId) {
			throw new Error("Cannot create a Stripe payment intent without a transaction id");
		}
		return { id: "pi_kiosk", amount: amountCents, amount_details: { tip: { amount: 0 } } };
	});
}

function setup() {
	chargeCard = makeChargeCard();
	createDocument = jest.fn().mockResolvedValue({ $id: "txn_kiosk" });
	recordPaymentWithRetry.mockResolvedValue({ ok: true, remaining: 0 });

	useAppwrite.mockReturnValue({
		databases: { createDocument },
		config: appwriteConfig,
		categories,
		items,
		refreshCategories: jest.fn(),
		refreshItems: jest.fn(),
		uniqueId: () => "unique",
		functions: { createExecution: jest.fn() },
		logout: jest.fn(),
		pinMode: { label: "Kiosk" },
	});

	useStripe.mockReturnValue({
		terminals: [{ id: "tmr_1", label: "Kiosk reader" }],
		selectedTerminal: { id: "tmr_1" },
		setSelectedTerminal: jest.fn(),
		chargeCard,
		terminalReady: true,
		terminal: {
			setReaderDisplay: jest.fn().mockResolvedValue({}),
			clearReaderDisplay: jest.fn().mockResolvedValue({}),
		},
		initializeTerminal: jest.fn(),
		stopTransactionInProgress: jest.fn(),
		transactionInProgress: false,
		setTransactionInProgress: jest.fn(),
	});
}

beforeEach(() => {
	jest.clearAllMocks();
	setup();
});

describe("self-checkout card payment", () => {
	test("threads the new transaction's id into chargeCard, so an intent can actually be minted", async () => {
		render(<SelfCheckout />);

		await userEvent.click(screen.getByRole("button", { name: /Chips/ }));
		await userEvent.click(screen.getByRole("button", { name: /Pay \$10\.00/ }));

		// The whole point: three arguments, the third being the transaction the intent must
		// carry in its metadata. A (amount, retrying) adapter drops it and the charge throws.
		await waitFor(() => expect(chargeCard).toHaveBeenCalledWith(1000, false, "txn_kiosk"));

		await waitFor(() =>
			expect(recordPaymentWithRetry).toHaveBeenCalledWith(
				expect.objectContaining({ transactionId: "txn_kiosk", method: "stripe", amount: 1000, paymentIntentId: "pi_kiosk" }),
			),
		);
		// And the customer is actually told it worked, rather than being shown the
		// "payment didn't go through" screen after a throw.
		expect(await screen.findByText("Thank you!")).toBeInTheDocument();
	});

	test("membership dues pay through the same adapter and carry the transaction id too", async () => {
		render(<SelfCheckout />);

		await userEvent.click(screen.getByRole("button", { name: /Pay Membership Dues/ }));
		await userEvent.type(screen.getByLabelText(/Name/), "Ada");
		await userEvent.type(screen.getByLabelText(/Email/), "ada@example.com");
		await userEvent.click(screen.getByRole("button", { name: /Continue/ }));
		await userEvent.click(screen.getByRole("button", { name: /^Pay \$40\.00$/ }));

		await waitFor(() => expect(chargeCard).toHaveBeenCalledWith(4000, false, "txn_kiosk"));
		expect(await screen.findByText(/Your membership dues have been paid/)).toBeInTheDocument();
	});

	test("a real charge failure still surfaces as a decline rather than a silent stall", async () => {
		chargeCard.mockRejectedValueOnce(new Error("Your card was declined."));
		render(<SelfCheckout />);

		await userEvent.click(screen.getByRole("button", { name: /Chips/ }));
		await userEvent.click(screen.getByRole("button", { name: /Pay \$10\.00/ }));

		expect(await screen.findByText(/Payment didn't go through/)).toBeInTheDocument();
		expect(recordPaymentWithRetry).not.toHaveBeenCalled();
	});
});
