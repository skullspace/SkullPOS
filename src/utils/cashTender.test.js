import { parseDollarsToCents, suggestQuickTenders } from "./cashTender";

describe("parseDollarsToCents", () => {
	test("parses a whole-dollar string", () => {
		expect(parseDollarsToCents("20")).toBe(2000);
	});

	test("parses a string with cents", () => {
		expect(parseDollarsToCents("20.5")).toBe(2050);
		expect(parseDollarsToCents("20.55")).toBe(2055);
	});

	test("empty input parses to 0", () => {
		expect(parseDollarsToCents("")).toBe(0);
	});

	test("unparseable input parses to 0 instead of NaN", () => {
		expect(parseDollarsToCents("abc")).toBe(0);
	});

	test("negative input parses to 0", () => {
		expect(parseDollarsToCents("-5")).toBe(0);
	});

	test("rounds fractional cents from floating point rather than truncating", () => {
		// 20.1 * 100 is 2009.9999999999998 in floating point -- must round, not floor.
		expect(parseDollarsToCents("20.1")).toBe(2010);
	});
});

describe("suggestQuickTenders", () => {
	test("offers the exact amount plus every common bill larger than it", () => {
		expect(suggestQuickTenders(700)).toEqual([700, 1000, 2000, 5000, 10000]);
	});

	test("never offers the exact amount twice when the total is itself a common bill", () => {
		expect(suggestQuickTenders(2000)).toEqual([2000, 5000, 10000]);
	});

	test("offers only the exact amount when the total exceeds every common bill", () => {
		expect(suggestQuickTenders(15000)).toEqual([15000]);
	});

	test("handles a zero total without throwing", () => {
		expect(suggestQuickTenders(0)).toEqual([0, 500, 1000, 2000, 5000, 10000]);
	});
});
