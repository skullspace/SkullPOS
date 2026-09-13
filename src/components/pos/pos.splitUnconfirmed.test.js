/**
 * pos.splitUnconfirmed.test.js
 *
 * P0-11's missing half: what the REGISTER does when a split sale's card leg was charged but
 * could not be recorded.
 *
 * SplitPaymentPanel latches itself correctly (see SplitPaymentPanel.test.js), but its only way
 * out used to be onCancel, which just dropped the panel -- leaving the cart fully populated and
 * the Checkout button live, so the cashier who had just read "Do NOT charge again" could ring
 * the identical cart a second time on card and take the money twice. These tests pin the till
 * being latched instead, and pin the sale NOT being cancelled: real money moved, so it must
 * stay pending and visible in the Transactions view for reconciliation.
 */

jest.mock("../../utils/api", () => {
	const actual = jest.requireActual("../../utils/api");
	return { ...actual, useAppwrite: jest.fn() };
});
jest.mock("../../utils/stripe", () => ({ useStripe: jest.fn() }));
jest.mock("../../utils/transactionStatus", () => ({ setTransactionStatus: jest.fn() }));
jest.mock("./salesReport", () => () => null);
jest.mock("./transactionsView", () => () => null);
jest.mock("./manageItemsView", () => () => null);
jest.mock("./mySalesView", () => () => null);
jest.mock("../common/Alert/Alert", () => () => null);

// The modals are what tell us the till state: which error is up, and whether Retry (which
// would re-charge the card) is offered.
jest.mock("../common/Modals/TransactionModals", () => ({
	ProcessingModal: () => null,
	CashPaymentModal: () => null,
	SuccessModal: () => null,
	ErrorModal: ({ isOpen, errorMessage, hideRetry }) =>
		isOpen ? (
			<div data-testid="error-modal" data-hide-retry={String(!!hideRetry)}>
				{errorMessage}
			</div>
		) : null,
}));

// Stands in for the cart panel: exposes the cart contents, whether the split panel is up, and
// a way to fire the callback SplitPaymentPanel's "Close -- reconcile manually" button fires.
jest.mock("./cart", () => (props) => (
	<div data-testid="cart">
		<div data-testid="split-active">{props.activeSplit ? "yes" : "no"}</div>
		{props.cart.map((line) => (
			<div key={line.$id} data-testid="cart-line" data-name={line.name} />
		))}
		<button
			onClick={() => props.onSplitUnconfirmedCharge({ amount: 2500, paymentIntentId: "pi_split" })}
		>
			fire-unconfirmed
		</button>
		<button onClick={() => props.onSplitCancel()}>fire-cancel</button>
	</div>
));

import React from "react";
import { render, screen, act, waitFor } from "@testing-library/react";
import POS from "./pos";
import { useAppwrite, ACTIVE_EVENT_OK, SETTINGS_OK } from "../../utils/api";
import { useStripe } from "../../utils/stripe";
import { setTransactionStatus } from "../../utils/transactionStatus";

const categories = [{ $id: "cat_food", name: "Food", alcohol: false }];
const items = [{ $id: "item_fries", name: "Fries", price: 2500, categories: "cat_food", enabledPOS: true }];

const appwriteConfig = {
	databases: {
		bar: { id: "bar", collections: { events: "events", items: "items", categories: "categories" } },
		data: { id: "data", collections: { config: "config" } },
	},
};

function setup() {
	useAppwrite.mockReturnValue({
		client: { subscribe: jest.fn(() => jest.fn()) },
		databases: {},
		config: appwriteConfig,
		categories,
		items,
		discounts: [],
		refreshCategories: jest.fn(),
		refreshItems: jest.fn(),
		refreshDiscounts: jest.fn(),
		refreshData: jest.fn(),
		fetchActiveEvent: jest.fn().mockResolvedValue({ status: ACTIVE_EVENT_OK, event: null, error: null }),
		settings: {},
		settingsStatus: SETTINGS_OK,
		uniqueId: () => "unique",
		currentUser: null,
		functions: {},
		fetchTransactions: jest.fn(),
		logout: jest.fn(),
		pinMode: { bartenderId: "b1" },
		sessionError: null,
	});

	useStripe.mockReturnValue({
		terminals: [],
		selectedTerminal: "",
		setSelectedTerminal: jest.fn(),
		chargeCard: jest.fn(),
		terminalReady: true,
		terminal: null,
		initializeTerminal: jest.fn(),
		stripeAlert: { active: false, message: "", type: "info" },
		setStripeAlert: jest.fn(),
		transactionInProgress: false,
		setTransactionInProgress: jest.fn(),
		handleCancelStripePayment: jest.fn(),
		stopTransactionInProgress: jest.fn(),
	});
}

function cartContents() {
	return screen.queryAllByTestId("cart-line").map((el) => el.getAttribute("data-name"));
}

async function renderPOS() {
	setup();
	render(<POS />);
	await act(async () => {
		await Promise.resolve();
	});
}

beforeEach(() => {
	jest.clearAllMocks();
});

describe("a split card leg that was charged but not recorded", () => {
	it("clears the cart and blocks any retry, so the same sale can't be charged twice", async () => {
		await renderPOS();

		await act(async () => {
			screen.getByText("Fries").click();
		});
		expect(cartContents()).toContain("Fries");

		await act(async () => {
			screen.getByText("fire-unconfirmed").click();
		});

		// The cart the cashier could otherwise have re-rung is gone...
		await waitFor(() => expect(cartContents()).toHaveLength(0));

		const modal = screen.getByTestId("error-modal");
		expect(modal).toHaveTextContent(/Card was charged \$25\.00/);
		expect(modal).toHaveTextContent(/Do not charge again/);
		expect(modal).toHaveTextContent(/pi_split/);
		// ...and Retry, which would mint a fresh intent and charge again, is not offered.
		expect(modal).toHaveAttribute("data-hide-retry", "true");
	});

	it("leaves the sale pending rather than cancelling money that already moved", async () => {
		await renderPOS();

		await act(async () => {
			screen.getByText("Fries").click();
		});
		await act(async () => {
			screen.getByText("fire-unconfirmed").click();
		});

		expect(setTransactionStatus).not.toHaveBeenCalled();
		expect(screen.getByTestId("split-active")).toHaveTextContent("no");
	});

	it("an ordinary split cancel still just drops the panel and keeps the cart", async () => {
		// The contrast case: nothing was taken, so the cashier goes back to normal checkout
		// with their cart intact. The latch above must not have replaced this path.
		await renderPOS();

		await act(async () => {
			screen.getByText("Fries").click();
		});
		await act(async () => {
			screen.getByText("fire-cancel").click();
		});

		expect(cartContents()).toContain("Fries");
		expect(screen.queryByTestId("error-modal")).not.toBeInTheDocument();
	});
});
