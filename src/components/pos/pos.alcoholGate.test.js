/**
 * pos.alcoholGate.test.js
 *
 * The alcohol gate wired up end to end in the register, rather than as a pure function
 * (see pos.test.js for that half).
 *
 * P0-3: fetchActiveEvent used to read the admin-only Events collection from an anonymous
 * PIN session, catch the 401, and return null -- which the gate read as "bar closed". Both
 * alcohol categories disappeared from the grid permanently, and the cart-stripping effect
 * below yanked any alcohol already rung in back out of the sale. The two things this file
 * pins down are that a FAILED lookup still hides alcohol (fail closed is correct and
 * deliberate) but never touches the cart, while a REAL "bar closed" answer still does both.
 */

jest.mock("../../utils/api", () => {
	const actual = jest.requireActual("../../utils/api");
	return { ...actual, useAppwrite: jest.fn() };
});
jest.mock("../../utils/stripe", () => ({ useStripe: jest.fn() }));
jest.mock("./salesReport", () => () => null);
jest.mock("./transactionsView", () => () => null);
jest.mock("./manageItemsView", () => () => null);
jest.mock("./mySalesView", () => () => null);
jest.mock("../common/Modals/TransactionModals", () => ({
	ProcessingModal: () => null,
	ErrorModal: () => null,
	CashPaymentModal: () => null,
	SuccessModal: () => null,
}));
jest.mock("../common/Alert/Alert", () => () => null);
// Cart lines carry the name as an attribute, not as text, so a text query for an item name
// unambiguously means "still on the selling grid" -- the two are exactly what these tests
// need to tell apart.
jest.mock("./cart", () => (props) => (
	<div data-testid="cart">
		{props.cart.map((line) => (
			<div key={line.$id} data-testid="cart-line" data-name={line.name} />
		))}
	</div>
));

import React from "react";
import { render, screen, act, waitFor } from "@testing-library/react";
import POS from "./pos";
import {
	useAppwrite,
	ACTIVE_EVENT_OK,
	ACTIVE_EVENT_UNAVAILABLE,
	SETTINGS_OK,
	SETTINGS_UNAVAILABLE,
} from "../../utils/api";
import { useStripe } from "../../utils/stripe";

const categories = [
	{ $id: "cat_food", name: "Food", alcohol: false },
	{ $id: "cat_beer", name: "Beer", alcohol: true },
];

const items = [
	{ $id: "item_fries", name: "Fries", price: 500, categories: "cat_food", enabledPOS: true },
	{ $id: "item_lager", name: "Lager", price: 700, categories: "cat_beer", enabledPOS: true },
];

const openEvent = {
	$id: "evt_live",
	name: "Friday Night",
	sellsAlcohol: true,
	barOpenTime: "18:00",
	barCloseTime: "02:00",
};

const okLive = { status: ACTIVE_EVENT_OK, event: openEvent, error: null };
const okNoEvent = { status: ACTIVE_EVENT_OK, event: null, error: null };
const lookupFailed = {
	status: ACTIVE_EVENT_UNAVAILABLE,
	event: null,
	error: "Could not check the active event: the function returned HTTP 401",
};

const appwriteConfig = {
	databases: {
		bar: {
			id: "bar",
			collections: { events: "events", items: "items", categories: "categories" },
		},
		data: { id: "data", collections: { config: "config" } },
	},
};

let fetchActiveEvent;

function setup({ initialResult = okLive, settings = {}, settingsStatus = SETTINGS_OK } = {}) {
	fetchActiveEvent = jest.fn().mockResolvedValue(initialResult);

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
		fetchActiveEvent,
		settings,
		settingsStatus,
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
		terminalReady: false,
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

/** Re-runs the 60s active-event poll with whatever fetchActiveEvent now resolves to. */
async function pollActiveEvent() {
	await act(async () => {
		jest.advanceTimersByTime(60000);
	});
}

function cartContents() {
	return screen.queryAllByTestId("cart-line").map((el) => el.getAttribute("data-name"));
}

beforeEach(() => {
	jest.clearAllMocks();
	// 21:00 -- inside the 18:00->02:00 window, so alcohol is legitimately on sale.
	jest.useFakeTimers().setSystemTime(new Date(2026, 8, 11, 21, 0, 0));
});

afterEach(() => {
	jest.useRealTimers();
});

async function renderPOS(options) {
	setup(options);
	render(<POS />);
	// Flush the initial fetchActiveEvent's promise before asserting on the gate.
	await act(async () => {
		await Promise.resolve();
	});
	return screen;
}

describe("POS alcohol gate", () => {
	it("shows alcohol during a live event's bar hours", async () => {
		await renderPOS();

		// "Beer" appears twice when shown: the jump-to chip and the category heading.
		expect(screen.queryAllByText("Beer").length).toBeGreaterThan(0);
		expect(screen.getByText("Lager")).toBeInTheDocument();
		expect(screen.queryByText(/Alcohol gate unavailable/)).not.toBeInTheDocument();
	});

	it("hides alcohol when there genuinely is no event tonight", async () => {
		await renderPOS({ initialResult: okNoEvent });

		expect(screen.queryAllByText("Beer")).toHaveLength(0);
		expect(screen.queryByText("Lager")).not.toBeInTheDocument();
		// Not a failure -- no error banner.
		expect(screen.queryByText(/Alcohol gate unavailable/)).not.toBeInTheDocument();
	});

	it("hides alcohol and says so explicitly when the lookup fails", async () => {
		await renderPOS({ initialResult: lookupFailed });

		// Fails closed, as designed.
		expect(screen.queryByText("Lager")).not.toBeInTheDocument();
		// ...but distinguishably. This is the diagnostic P0-3 had nowhere except console.error.
		expect(screen.getByText(/Alcohol gate unavailable/)).toBeInTheDocument();
		expect(useStripe().setStripeAlert).toHaveBeenCalledWith(
			expect.objectContaining({ active: true, type: "error", message: expect.stringMatching(/Alcohol gate unavailable/) })
		);
	});

	it("does NOT empty the cart when a mid-shift poll fails", async () => {
		await renderPOS();

		// Ring in a beer while the bar is open.
		await act(async () => {
			screen.getByText("Lager").click();
		});
		expect(cartContents()).toContain("Lager");

		// The next poll 401s -- the exact P0-3 failure, now arriving mid-sale.
		fetchActiveEvent.mockResolvedValue(lookupFailed);
		await pollActiveEvent();

		// Alcohol comes off the grid (safe, reversible)...
		await waitFor(() => expect(screen.queryByText("Lager")).not.toBeInTheDocument());
		expect(screen.getByText(/Alcohol gate unavailable/)).toBeInTheDocument();
		// ...but the customer's already-rung beer survives. Old behaviour dropped it.
		expect(cartContents()).toContain("Lager");
	});

	it("DOES empty alcohol from the cart when the bar genuinely closes mid-sale", async () => {
		await renderPOS();

		await act(async () => {
			screen.getByText("Lager").click();
		});
		expect(cartContents()).toContain("Lager");

		// A real answer: the event stopped selling alcohol. That must still pull it.
		fetchActiveEvent.mockResolvedValue({
			status: ACTIVE_EVENT_OK,
			event: { ...openEvent, sellsAlcohol: false },
			error: null,
		});
		await pollActiveEvent();

		await waitFor(() => expect(cartContents()).not.toContain("Lager"));
	});

	it("recovers on its own once the lookup starts answering again", async () => {
		await renderPOS({ initialResult: lookupFailed });
		expect(screen.queryByText("Lager")).not.toBeInTheDocument();

		// No realtime event can repair this -- the Events subscription is permission-gated the
		// same way the read was -- so the poll is the only thing that brings the bar back.
		fetchActiveEvent.mockResolvedValue(okLive);
		await pollActiveEvent();

		await waitFor(() => expect(screen.getByText("Lager")).toBeInTheDocument());
		expect(screen.queryByText(/Alcohol gate unavailable/)).not.toBeInTheDocument();
	});

	it("polls the active event rather than relying on the Events realtime channel", async () => {
		await renderPOS();
		expect(fetchActiveEvent).toHaveBeenCalledTimes(1);

		await pollActiveEvent();
		expect(fetchActiveEvent).toHaveBeenCalledTimes(2);
	});

	it("keeps non-alcohol items on sale through a failed lookup", async () => {
		await renderPOS({ initialResult: lookupFailed });

		expect(screen.getByText("Food")).toBeInTheDocument();
		expect(screen.getByText("Fries")).toBeInTheDocument();
	});

	it("hides alcohol when the kill-switch config can't be read, even on a wide-open event", async () => {
		// P1-13. refreshData swallows its error and leaves `settings` null, so
		// `settings?.alcohol_override_disabled === "true"` was false and an unreachable config
		// read as "override off" -- alcohol on sale, during a compliance stop nobody could see.
		await renderPOS({ initialResult: okLive, settings: null, settingsStatus: SETTINGS_UNAVAILABLE });

		expect(screen.queryByText("Lager")).not.toBeInTheDocument();
		expect(screen.getByText(/can't read the alcohol override setting/)).toBeInTheDocument();
		// Non-alcohol trade carries on as normal -- this is a gate, not an outage.
		expect(screen.getByText("Fries")).toBeInTheDocument();
	});

	it("does NOT empty the cart when only the kill-switch config is unreadable", async () => {
		await renderPOS({ initialResult: okLive });
		await act(async () => {
			screen.getByText("Lager").click();
		});
		expect(cartContents()).toContain("Lager");

		// Same reasoning as a failed event poll: hiding the grid is reversible, gutting a
		// customer's in-progress order over a config timeout is not.
		useAppwrite.mockReturnValue({ ...useAppwrite(), settings: null, settingsStatus: SETTINGS_UNAVAILABLE });
		await pollActiveEvent();

		await waitFor(() => expect(screen.queryByText("Lager")).not.toBeInTheDocument());
		expect(cartContents()).toContain("Lager");
	});

	it("an admin who actually turned the switch on DOES clear alcohol from the cart", async () => {
		await renderPOS({ initialResult: okLive });
		await act(async () => {
			screen.getByText("Lager").click();
		});
		expect(cartContents()).toContain("Lager");

		// A config we read successfully is authoritative -- this is a deliberate stop, not a
		// failure, so the sale in progress must lose its alcohol.
		useAppwrite.mockReturnValue({
			...useAppwrite(),
			settings: { alcohol_override_disabled: "true" },
			settingsStatus: SETTINGS_OK,
		});
		await pollActiveEvent();

		await waitFor(() => expect(cartContents()).not.toContain("Lager"));
	});

	it("hides alcohol when the event service answers without the bar-hours fields", async () => {
		// A deployed Ticketing-ActiveEvent that predates the sellsAlcohol/barOpenTime/
		// barCloseTime allowlist. Alcohol hid either way -- but silently, with the gate calling
		// itself authoritative, so the cart-stripping effect was armed and no banner fired.
		await renderPOS({
			initialResult: { status: ACTIVE_EVENT_OK, event: { $id: "evt_live", name: "Friday Night" }, error: null },
		});

		expect(screen.queryByText("Lager")).not.toBeInTheDocument();
		expect(screen.getByText(/isn't reporting bar hours/)).toBeInTheDocument();
	});
});
