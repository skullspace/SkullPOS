import { isWithinBarHours } from "./barHours";

const at = (hours, minutes) => new Date(2026, 0, 1, hours, minutes);

describe("isWithinBarHours", () => {
	test("no event returns false", () => {
		expect(isWithinBarHours(null, at(20, 0))).toBe(false);
	});

	test("sellsAlcohol:false returns false regardless of time", () => {
		const event = { sellsAlcohol: false, barOpenTime: "18:00", barCloseTime: "23:00" };
		expect(isWithinBarHours(event, at(20, 0))).toBe(false);
	});

	test("missing bar hours fails closed", () => {
		const event = { sellsAlcohol: true };
		expect(isWithinBarHours(event, at(20, 0))).toBe(false);
	});

	test("malformed bar hours fails closed", () => {
		const event = { sellsAlcohol: true, barOpenTime: "not-a-time", barCloseTime: "23:00" };
		expect(isWithinBarHours(event, at(20, 0))).toBe(false);
	});

	test("within a same-day window returns true", () => {
		const event = { sellsAlcohol: true, barOpenTime: "18:00", barCloseTime: "23:00" };
		expect(isWithinBarHours(event, at(20, 0))).toBe(true);
	});

	test("before a same-day window returns false", () => {
		const event = { sellsAlcohol: true, barOpenTime: "18:00", barCloseTime: "23:00" };
		expect(isWithinBarHours(event, at(17, 59))).toBe(false);
	});

	test("at or after a same-day window's close returns false", () => {
		const event = { sellsAlcohol: true, barOpenTime: "18:00", barCloseTime: "23:00" };
		expect(isWithinBarHours(event, at(23, 0))).toBe(false);
	});

	test("an overnight window is within after midnight, before close", () => {
		const event = { sellsAlcohol: true, barOpenTime: "18:00", barCloseTime: "02:00" };
		expect(isWithinBarHours(event, at(1, 30))).toBe(true);
	});

	test("an overnight window is within late evening, after open", () => {
		const event = { sellsAlcohol: true, barOpenTime: "18:00", barCloseTime: "02:00" };
		expect(isWithinBarHours(event, at(22, 0))).toBe(true);
	});

	test("an overnight window is not within mid-afternoon", () => {
		const event = { sellsAlcohol: true, barOpenTime: "18:00", barCloseTime: "02:00" };
		expect(isWithinBarHours(event, at(14, 0))).toBe(false);
	});
});
