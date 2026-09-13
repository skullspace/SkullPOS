/**
 * api.test.js
 *
 * Covers parseActiveEventExecution, the half of fetchActiveEvent that decides what an
 * Appwrite execution actually told us.
 *
 * The bug this replaced (P0-3): POS read the Events collection straight from the client,
 * Events is admin-team-only, the PIN session is anonymous, so the read 401'd -- and the
 * catch returned `null`, which is indistinguishable from "no event tonight". Every alcohol
 * item vanished from the register and every DJ voucher was rejected, permanently, with a
 * console.error as the only symptom. So the one thing these tests exist to pin down is
 * that a failure NEVER comes back looking like an answer.
 */

import { parseActiveEventExecution, ACTIVE_EVENT_OK, ACTIVE_EVENT_UNAVAILABLE } from "./api";

/** The full 12-key projection Ticketing-ActiveEvent returns for a live event. */
const liveEvent = {
	$id: "evt_live",
	eventId: "zeffy-123",
	name: "Friday Night",
	description: "the one with the DJ",
	date: "2026-09-11",
	location: "Skullspace",
	standardTicketPrice: 0,
	currency: "CAD",
	isActive: true,
	sellsAlcohol: true,
	barOpenTime: "18:00",
	barCloseTime: "02:00",
};

function completed(body, responseStatusCode = 200) {
	return { status: "completed", responseStatusCode, responseBody: JSON.stringify(body) };
}

describe("parseActiveEventExecution", () => {
	it("passes the alcohol-gate fields straight through on a live event", () => {
		const result = parseActiveEventExecution(completed({ event: liveEvent }));

		expect(result.status).toBe(ACTIVE_EVENT_OK);
		expect(result.error).toBeNull();
		expect(result.event).toEqual(liveEvent);
		// The three fields the gate actually turns on.
		expect(result.event.sellsAlcohol).toBe(true);
		expect(result.event.barOpenTime).toBe("18:00");
		expect(result.event.barCloseTime).toBe("02:00");
		// $id is what the DJ-voucher check compares against giftcard.eventId.
		expect(result.event.$id).toBe("evt_live");
	});

	it("does not coerce a legitimately free event's 0-cent price", () => {
		const result = parseActiveEventExecution(completed({ event: liveEvent }));
		expect(result.event.standardTicketPrice).toBe(0);
	});

	it("reports a genuine 'no event tonight' as an answer, not a failure", () => {
		const result = parseActiveEventExecution(completed({ event: null }));

		expect(result.status).toBe(ACTIVE_EVENT_OK);
		expect(result.event).toBeNull();
		expect(result.error).toBeNull();
	});

	it("reports the function's own 500 as unavailable, never as 'no event'", () => {
		const result = parseActiveEventExecution(
			completed({ error: "Failed to load the active event" }, 500)
		);

		expect(result.status).toBe(ACTIVE_EVENT_UNAVAILABLE);
		expect(result.event).toBeNull();
		expect(result.error).toMatch(/500/);
	});

	it("reports a 401 on the execution itself as unavailable", () => {
		// The exact shape of the shipped bug: an auth failure reaching the client.
		const result = parseActiveEventExecution(completed({ message: "Unauthorized" }, 401));

		expect(result.status).toBe(ACTIVE_EVENT_UNAVAILABLE);
		expect(result.event).toBeNull();
	});

	it.each(["waiting", "processing", "failed", "scheduled"])(
		"reports a %s execution as unavailable rather than parsing its empty body",
		(status) => {
			// A non-completed execution carries an empty responseBody. Parsing it optimistically
			// is the other way to fake up a convincing "no event".
			const result = parseActiveEventExecution({
				status,
				responseStatusCode: 0,
				responseBody: "",
			});

			expect(result.status).toBe(ACTIVE_EVENT_UNAVAILABLE);
			expect(result.event).toBeNull();
			expect(result.error).toMatch(status);
		}
	);

	it("reports an unreadable body as unavailable", () => {
		const result = parseActiveEventExecution({
			status: "completed",
			responseStatusCode: 200,
			responseBody: "<html>502 Bad Gateway</html>",
		});

		expect(result.status).toBe(ACTIVE_EVENT_UNAVAILABLE);
		expect(result.event).toBeNull();
	});

	it("reports a 200 body with no `event` key as unavailable", () => {
		// e.g. the error body leaking through with a 200, or a future shape change.
		const result = parseActiveEventExecution(completed({ ok: true }));

		expect(result.status).toBe(ACTIVE_EVENT_UNAVAILABLE);
		expect(result.event).toBeNull();
	});

	it("reports a missing execution as unavailable", () => {
		expect(parseActiveEventExecution(undefined).status).toBe(ACTIVE_EVENT_UNAVAILABLE);
		expect(parseActiveEventExecution(null).event).toBeNull();
	});
});
