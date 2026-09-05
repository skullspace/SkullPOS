import { formatCAD } from "./format";

describe("formatCAD", () => {
	test("formats whole dollars", () => {
		expect(formatCAD(1050)).toBe("$10.50");
	});

	test("formats zero", () => {
		expect(formatCAD(0)).toBe("$0.00");
	});

	test("formats sub-dollar amounts", () => {
		expect(formatCAD(5)).toBe("$0.05");
	});

	test("formats large amounts with thousands separators", () => {
		expect(formatCAD(123456789)).toBe("$1,234,567.89");
	});

	test("formats negative amounts (refunds)", () => {
		expect(formatCAD(-500)).toBe("-$5.00");
	});
});
