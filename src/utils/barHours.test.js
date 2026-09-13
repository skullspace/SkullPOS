import { isWithinBarHours, parseInstant } from "./barHours";

const at = (hours, minutes) => new Date(2026, 0, 1, hours, minutes);
/** Jan 2 -- the far side of midnight, for an overnight window's close. */
const nextDayAt = (hours, minutes) => new Date(2026, 0, 2, hours, minutes);

/**
 * Every instant below is built from a LOCAL Date and then serialized, so the fixtures describe
 * the same wall clock a bartender would read off the venue's own wall no matter which zone the
 * test machine runs in.
 */
const iso = (date) => date.toISOString();

/** 18:00 -> 23:00, same evening. */
const sameDay = {
	sellsAlcohol: true,
	barOpensAt: iso(at(18, 0)),
	barClosesAt: iso(at(23, 0)),
};
/** 18:00 -> 02:00 the following morning. */
const overnight = {
	sellsAlcohol: true,
	barOpensAt: iso(at(18, 0)),
	barClosesAt: iso(nextDayAt(2, 0)),
};

describe("isWithinBarHours", () => {
	test("no event returns false", () => {
		expect(isWithinBarHours(null, at(20, 0))).toBe(false);
	});

	test("sellsAlcohol:false returns false regardless of time", () => {
		expect(isWithinBarHours({ ...sameDay, sellsAlcohol: false }, at(20, 0))).toBe(false);
	});

	test("missing bar hours fails closed", () => {
		const event = { sellsAlcohol: true };
		expect(isWithinBarHours(event, at(20, 0))).toBe(false);
	});

	test("malformed bar hours fails closed", () => {
		const event = { sellsAlcohol: true, barOpensAt: "not-a-time", barClosesAt: iso(at(23, 0)) };
		expect(isWithinBarHours(event, at(20, 0))).toBe(false);
	});

	test("within a same-day window returns true", () => {
		expect(isWithinBarHours(sameDay, at(20, 0))).toBe(true);
	});

	test("before a same-day window returns false", () => {
		expect(isWithinBarHours(sameDay, at(17, 59))).toBe(false);
	});

	test("at or after a same-day window's close returns false", () => {
		expect(isWithinBarHours(sameDay, at(23, 0))).toBe(false);
	});

	test("a same-day window does not reopen the next day", () => {
		// The wall-clock parser had no way to express this: "18:00"->"23:00" was every day's
		// 18:00 to 23:00, forever. A pair of instants is one night and one night only.
		expect(isWithinBarHours(sameDay, nextDayAt(20, 0))).toBe(false);
	});

	test("an overnight window is within late evening, after open", () => {
		expect(isWithinBarHours(overnight, at(22, 0))).toBe(true);
	});

	test("an overnight window is within after midnight, before close", () => {
		expect(isWithinBarHours(overnight, nextDayAt(1, 30))).toBe(true);
	});

	test("an overnight window is not within mid-afternoon", () => {
		expect(isWithinBarHours(overnight, at(14, 0))).toBe(false);
	});
});

describe("isWithinBarHours reads the instant window", () => {
	test.each([
		["mid-afternoon, before open", at(14, 0), false],
		["the exact minute the bar opens", at(18, 0), true],
		["late evening", at(22, 0), true],
		["after midnight, before close", nextDayAt(1, 30), true],
		["the exact minute the bar closes", nextDayAt(2, 0), false],
		["the morning after", nextDayAt(9, 0), false],
	])("%s", (_label, now, expected) => {
		expect(isWithinBarHours(overnight, now)).toBe(expected);
	});

	test("an overnight instant window needs no midnight wrap-around rule", () => {
		// The retired wall-clock path inferred "overnight" from close <= open, which is also why
		// an inverted pair used to be ambiguous rather than simply wrong. With instants the close
		// carries the next day itself, so one comparison covers both kinds of window.
		expect(isWithinBarHours(overnight, nextDayAt(0, 0))).toBe(true);
		expect(isWithinBarHours(overnight, nextDayAt(1, 59))).toBe(true);
	});

	test("sellsAlcohol:false still wins over a wide-open instant window", () => {
		expect(isWithinBarHours({ ...overnight, sellsAlcohol: false }, at(22, 0))).toBe(false);
	});

	test("an event carrying no window at all still fails closed", () => {
		expect(isWithinBarHours({ sellsAlcohol: true }, at(22, 0))).toBe(false);
	});

	test("instants offered as Date objects are accepted", () => {
		const event = { sellsAlcohol: true, barOpensAt: at(18, 0), barClosesAt: nextDayAt(2, 0) };
		expect(isWithinBarHours(event, at(22, 0))).toBe(true);
		expect(isWithinBarHours(event, at(14, 0))).toBe(false);
	});
});

/**
 * The fallback's removal, pinned from the other side.
 *
 * Every case in this block used to be rescued by the legacy barOpenTime/barCloseTime wall clocks
 * and now hides alcohol instead. That is the entire behavioural delta of retiring those two
 * attributes, and it is deliberate: once the columns are gone there is nothing left to fall back
 * TO, so an unusable window can only be a "we don't know", and a "we don't know" fails closed.
 * These tests exist so the fallback cannot quietly grow back.
 */
describe("an unusable instant window fails closed instead of falling back", () => {
	/** The retired shape on its own. Nothing in the register reads either key any more. */
	const retiredOnly = {
		sellsAlcohol: true,
		barOpenTime: "18:00",
		barCloseTime: "02:00",
	};

	test("a row carrying only the retired wall clocks has no window at all", () => {
		// 22:00 sits squarely inside what "18:00" to "02:00" spells, and the bar stays shut.
		expect(isWithinBarHours(retiredOnly, at(22, 0))).toBe(false);
		expect(isWithinBarHours(retiredOnly, nextDayAt(1, 30))).toBe(false);
	});

	test("garbage instants do not fall back to the wall clocks on the same row", () => {
		const event = { ...retiredOnly, barOpensAt: "not-a-date", barClosesAt: "" };
		expect(isWithinBarHours(event, at(22, 0))).toBe(false);
	});

	test("only one of the two instants present is not a window", () => {
		const event = { ...retiredOnly, barOpensAt: iso(at(18, 0)) };
		expect(isWithinBarHours(event, at(22, 0))).toBe(false);
	});

	test("an instant window that runs backwards fails closed", () => {
		// The shape a bad backfill makes: an 02:00 close that never got the following day
		// attached. While the wall clocks existed this fell back to them rather than blanking a
		// whole event's alcohol, which was the lesser evil then. They are gone now, so an
		// interval that runs backwards is simply not a window, and the safe answer is the only
		// one left to give.
		const event = { ...retiredOnly, barOpensAt: iso(at(18, 0)), barClosesAt: iso(at(2, 0)) };
		expect(isWithinBarHours(event, at(22, 0))).toBe(false);
		expect(isWithinBarHours(event, nextDayAt(1, 30))).toBe(false);
		expect(isWithinBarHours(event, at(14, 0))).toBe(false);
	});

	test("the retired event-hour columns are not consulted either", () => {
		// event_start/event_end never described the BAR window and were never read here. Pinned
		// so that nobody reaches for them as a substitute once they are dropped too.
		const event = { sellsAlcohol: true, event_start: 20, event_end: 4 };
		expect(isWithinBarHours(event, at(22, 0))).toBe(false);
	});
});

/**
 * The register/board divergence the instants exist to delete.
 *
 * Before the instants, this exact row showed alcohol on the menu board and hid it on the
 * register: the board's parser accepted a bare "1800", this one demanded the colon. The row is
 * kept as a fixture because it is the concrete reason the migration happened at all, but the
 * divergence is now structurally impossible rather than merely tested -- neither surface has a
 * wall clock left to disagree about, and the only window either one reads is the instant pair.
 */
describe("the colon-less legacy row that used to split the board from the register", () => {
	const colonless = {
		sellsAlcohol: true,
		barOpenTime: "1800",
		barCloseTime: "0200",
		barOpensAt: "2026-01-02T02:00:00.000Z",
		barClosesAt: "2026-01-02T10:00:00.000Z",
	};

	test("with instants present the register shows alcohol inside the window", () => {
		expect(isWithinBarHours(colonless, new Date("2026-01-02T02:00:00.000Z"))).toBe(true);
		expect(isWithinBarHours(colonless, new Date("2026-01-02T04:00:00.000Z"))).toBe(true);
		expect(isWithinBarHours(colonless, new Date("2026-01-02T09:59:00.000Z"))).toBe(true);
	});

	test("and hides it outside the window", () => {
		expect(isWithinBarHours(colonless, new Date("2026-01-02T01:59:00.000Z"))).toBe(false);
		expect(isWithinBarHours(colonless, new Date("2026-01-02T10:00:00.000Z"))).toBe(false);
	});

	test("strip the instants and both legacy forms are equally unreadable now", () => {
		// This assertion used to pin the parser rejecting the colon-less form specifically, which
		// was the register half of the divergence. There is no parser left to reject anything, so
		// the colon-less row and the well-formed one now get the same answer -- which is the
		// point. The second expect is the one carrying new information.
		const colonlessLegacy = { sellsAlcohol: true, barOpenTime: "1800", barCloseTime: "0200" };
		const wellFormedLegacy = { sellsAlcohol: true, barOpenTime: "18:00", barCloseTime: "02:00" };
		expect(isWithinBarHours(colonlessLegacy, at(20, 0))).toBe(false);
		expect(isWithinBarHours(wellFormedLegacy, at(20, 0))).toBe(false);
	});
});

describe("parseInstant", () => {
	test("accepts the ISO shapes an Appwrite datetime attribute comes back as", () => {
		expect(parseInstant("2026-06-05T01:00:00.000Z")).toBe(Date.parse("2026-06-05T01:00:00Z"));
		expect(parseInstant("2026-06-05T01:00:00.000+00:00")).toBe(Date.parse("2026-06-05T01:00:00Z"));
		expect(parseInstant("2026-06-05T01:00:00-05:00")).toBe(Date.parse("2026-06-05T06:00:00Z"));
		expect(parseInstant("  2026-06-05T01:00:00Z  ")).toBe(Date.parse("2026-06-05T01:00:00Z"));
		expect(parseInstant(new Date("2026-06-05T01:00:00Z"))).toBe(Date.parse("2026-06-05T01:00:00Z"));
	});

	test("rejects a bare wall clock instead of reading it as the year 1800", () => {
		// `new Date("1800")` is not an invalid date -- it is January 1st, 1800. This matters MORE
		// now, not less: with the wall-clock parser gone, an "HH:mm"-shaped value that somehow
		// reaches barOpensAt has no legitimate reading at all, and letting it through Date.parse
		// would open a window two centuries wide that every `now` falls inside.
		expect(parseInstant("1800")).toBeNull();
		expect(parseInstant("18:00")).toBeNull();
		expect(parseInstant("0200")).toBeNull();
	});

	test("rejects a date with no time, and anything that is not a string or Date", () => {
		expect(parseInstant("2026-06-05")).toBeNull();
		expect(parseInstant(null)).toBeNull();
		expect(parseInstant(undefined)).toBeNull();
		expect(parseInstant(1780000000000)).toBeNull();
		expect(parseInstant("")).toBeNull();
		expect(parseInstant("2026-13-45T99:99:99Z")).toBeNull();
		expect(parseInstant(new Date("nope"))).toBeNull();
	});
});
