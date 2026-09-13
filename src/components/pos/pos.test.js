/**
 * pos.test.js
 *
 * Covers resolveAlcoholGate, the register's answer to "may alcohol be sold right now, and
 * how sure are we?".
 *
 * Two failures it has to keep apart, because P0-3 conflated them for months:
 *   - a real "no event / bar closed" answer, which SHOULD hide alcohol and SHOULD pull
 *     alcohol back out of a cart;
 *   - a failed or not-yet-answered lookup, which should still hide alcohol (fail closed)
 *     but must NOT touch a cart that's mid-sale.
 */

import {
	resolveAlcoholGate,
	readAlcoholOverride,
	ALCOHOL_OVERRIDE_ON,
	ALCOHOL_OVERRIDE_OFF,
	ALCOHOL_OVERRIDE_UNKNOWN,
	ALCOHOL_OVERRIDE_PENDING,
} from "./pos";
import {
	ACTIVE_EVENT_OK,
	ACTIVE_EVENT_UNAVAILABLE,
	SETTINGS_OK,
	SETTINGS_PENDING,
	SETTINGS_UNAVAILABLE,
} from "../../utils/api";

// 21:00 -- inside an 18:00->02:00 overnight bar window.
const duringBarHours = new Date(2026, 8, 11, 21, 0);
// 15:00 -- same event, before the bar opens.
const beforeBarHours = new Date(2026, 8, 11, 15, 0);

const openEvent = {
	$id: "evt_live",
	name: "Friday Night",
	sellsAlcohol: true,
	barOpenTime: "18:00",
	barCloseTime: "02:00",
};

function gate(activeEventState, { alcoholOverride = ALCOHOL_OVERRIDE_OFF, now = duringBarHours } = {}) {
	return resolveAlcoholGate({ activeEventState, alcoholOverride, now });
}

describe("resolveAlcoholGate", () => {
	it("allows alcohol during a live event's bar hours", () => {
		// The case that has been broken since 2026-09-09: this is the bartender at 21:00.
		expect(gate({ status: ACTIVE_EVENT_OK, event: openEvent })).toEqual({
			allowed: true,
			known: true,
			unavailable: false,
			unavailableReason: null,
		});
	});

	it("hides alcohol outside the bar window of a live event", () => {
		const result = gate({ status: ACTIVE_EVENT_OK, event: openEvent }, { now: beforeBarHours });
		expect(result.allowed).toBe(false);
		// A real answer, so the cart may be cleaned up.
		expect(result.known).toBe(true);
	});

	it("hides alcohol when the event says it doesn't sell alcohol", () => {
		const result = gate({
			status: ACTIVE_EVENT_OK,
			event: { ...openEvent, sellsAlcohol: false },
		});
		expect(result).toEqual({ allowed: false, known: true, unavailable: false, unavailableReason: null });
	});

	it("hides alcohol when there is genuinely no event tonight, and treats that as known", () => {
		const result = gate({ status: ACTIVE_EVENT_OK, event: null });
		expect(result.allowed).toBe(false);
		expect(result.known).toBe(true);
		expect(result.unavailable).toBe(false);
	});

	it("fails closed when the lookup failed -- but does NOT call that a known gate", () => {
		// The 401/500/offline case. Alcohol comes off the grid (safe, reversible), but
		// `known: false` is what stops the cart-stripping effect from firing, so a transient
		// error can't gut a customer's order mid-sale.
		const result = gate({
			status: ACTIVE_EVENT_UNAVAILABLE,
			event: null,
			error: "Could not check the active event: the function returned HTTP 401",
		});
		expect(result).toEqual({ allowed: false, known: false, unavailable: true, unavailableReason: "event-lookup" });
	});

	it("fails closed while the first lookup is still pending, without claiming to know", () => {
		const result = gate({ status: "pending", event: null, error: null });
		expect(result).toEqual({ allowed: false, known: false, unavailable: false, unavailableReason: null });
	});

	it("does not lose a previously-known event's gate state to a failure silently", () => {
		// Same event, two consecutive polls: the second one fails. Alcohol hides either way,
		// but only the first is authoritative enough to act on the cart.
		const ok = gate({ status: ACTIVE_EVENT_OK, event: openEvent });
		const failed = gate({ status: ACTIVE_EVENT_UNAVAILABLE, event: null, error: "boom" });

		expect(ok.allowed).toBe(true);
		expect(failed.allowed).toBe(false);
		expect(failed.known).toBe(false);
	});

	describe("admin override", () => {
		it("hides alcohol regardless of a wide-open event", () => {
			const result = gate(
				{ status: ACTIVE_EVENT_OK, event: openEvent },
				{ alcoholOverride: ALCOHOL_OVERRIDE_ON }
			);
			expect(result.allowed).toBe(false);
			expect(result.known).toBe(true);
		});

		it("is authoritative even when the event lookup is unavailable", () => {
			// The override is local config, not a permission-gated read -- an admin killing
			// alcohol must still empty the cart even if the event service is down.
			const result = gate(
				{ status: ACTIVE_EVENT_UNAVAILABLE, event: null, error: "boom" },
				{ alcoholOverride: ALCOHOL_OVERRIDE_ON }
			);
			expect(result.allowed).toBe(false);
			expect(result.known).toBe(true);
		});

		it("fails CLOSED, not open, when the override itself can't be read (P1-13)", () => {
			// The exact inversion the audit called out: an unreachable barData/config used to
			// evaluate to "override off" = alcohol permitted, during a wide-open bar window.
			const result = gate(
				{ status: ACTIVE_EVENT_OK, event: openEvent },
				{ alcoholOverride: ALCOHOL_OVERRIDE_UNKNOWN }
			);
			expect(result.allowed).toBe(false);
			// ...but not authoritative: a config read that failed must not gut a live cart.
			expect(result.known).toBe(false);
			expect(result.unavailableReason).toBe("override");
		});

		it("hides alcohol while the config read is still pending, without raising an alarm", () => {
			const result = gate(
				{ status: ACTIVE_EVENT_OK, event: openEvent },
				{ alcoholOverride: ALCOHOL_OVERRIDE_PENDING }
			);
			expect(result.allowed).toBe(false);
			expect(result.known).toBe(false);
			// Every boot passes through this state -- it is not a fault to report.
			expect(result.unavailable).toBe(false);
		});
	});

	describe("an event service that doesn't report the alcohol fields", () => {
		// A deployed Ticketing-ActiveEvent that predates the sellsAlcohol/barOpenTime/
		// barCloseTime allowlist returns a valid 200 with those fields simply missing.
		const staleEvent = { $id: "evt_live", name: "Friday Night" };

		it("is treated as no answer at all, not as 'no alcohol tonight'", () => {
			const result = gate({ status: ACTIVE_EVENT_OK, event: staleEvent });
			expect(result.allowed).toBe(false);
			// The dangerous part if this were missed: known:true would arm the cart-stripping
			// effect and silence the banner, so the gate would look healthy while being blind.
			expect(result.known).toBe(false);
			expect(result.unavailable).toBe(true);
			expect(result.unavailableReason).toBe("event-fields");
		});

		it("still distinguishes it from a genuinely alcohol-free event", () => {
			const result = gate({ status: ACTIVE_EVENT_OK, event: { ...staleEvent, sellsAlcohol: false } });
			expect(result.allowed).toBe(false);
			expect(result.known).toBe(true);
			expect(result.unavailable).toBe(false);
		});
	});

	it("tolerates a missing state object", () => {
		expect(resolveAlcoholGate({ alcoholOverride: ALCOHOL_OVERRIDE_OFF, now: duringBarHours })).toEqual({
			allowed: false,
			known: false,
			unavailable: false,
			unavailableReason: null,
		});
	});
});

describe("readAlcoholOverride", () => {
	it("reads an explicitly-set kill switch as ON", () => {
		expect(readAlcoholOverride({ alcohol_override_disabled: "true" }, SETTINGS_OK)).toBe(ALCOHOL_OVERRIDE_ON);
	});

	it("reads a config we successfully read, with no such row, as OFF", () => {
		// This IS an answer: nobody ever turned the switch on. It must not hide alcohol.
		expect(readAlcoholOverride({ member_discount: "10" }, SETTINGS_OK)).toBe(ALCOHOL_OVERRIDE_OFF);
		expect(readAlcoholOverride({ alcohol_override_disabled: "false" }, SETTINGS_OK)).toBe(ALCOHOL_OVERRIDE_OFF);
	});

	it("reads a config it could NOT read as UNKNOWN, never as OFF", () => {
		// refreshData swallows its error and leaves settings null. `null?.x === "true"` is
		// false, which is how an unreachable config became "alcohol permitted" (P1-13).
		expect(readAlcoholOverride(null, SETTINGS_UNAVAILABLE)).toBe(ALCOHOL_OVERRIDE_UNKNOWN);
		// Stale data left over from an earlier successful read is no better -- the status,
		// not the presence of a cached object, is what decides.
		expect(readAlcoholOverride({ alcohol_override_disabled: "false" }, SETTINGS_UNAVAILABLE)).toBe(
			ALCOHOL_OVERRIDE_UNKNOWN
		);
	});

	it("treats a value it cannot parse as ON rather than guessing OFF", () => {
		expect(readAlcoholOverride({ alcohol_override_disabled: "yes-please" }, SETTINGS_OK)).toBe(
			ALCOHOL_OVERRIDE_ON
		);
	});

	it("reports PENDING before the first read answers", () => {
		expect(readAlcoholOverride(null, SETTINGS_PENDING)).toBe(ALCOHOL_OVERRIDE_PENDING);
	});
});
