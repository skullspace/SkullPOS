import { findGiftcardByUPC } from "./giftcard";

describe("findGiftcardByUPC", () => {
	test("returns a minimal giftcard shape when found", async () => {
		const functions = {
			createExecution: jest
				.fn()
				.mockResolvedValue({ responseBody: JSON.stringify({ found: true, id: "gc1", balance: 5000 }) }),
		};

		const result = await findGiftcardByUPC({ functions, code: "75855000001" });

		expect(result).toEqual({ $id: "gc1", balance: 5000, eventId: null, active: true });
		expect(functions.createExecution).toHaveBeenCalledWith({
			functionId: "6a9c5c1acb643536564a",
			body: JSON.stringify({ code: "75855000001" }),
		});
	});

	test("surfaces DJ-voucher fields when the response includes them", async () => {
		const functions = {
			createExecution: jest.fn().mockResolvedValue({
				responseBody: JSON.stringify({ found: true, id: "gc9", balance: 2000, eventId: "event1", active: false }),
			}),
		};

		const result = await findGiftcardByUPC({ functions, code: "75855999" });

		expect(result).toEqual({ $id: "gc9", balance: 2000, eventId: "event1", active: false });
	});

	test("returns null when no giftcard matches", async () => {
		const functions = { createExecution: jest.fn().mockResolvedValue({ responseBody: JSON.stringify({ found: false }) }) };

		const result = await findGiftcardByUPC({ functions, code: "nope" });

		expect(result).toBeNull();
	});

	test("defaults balance to 0 when absent from the response", async () => {
		const functions = {
			createExecution: jest.fn().mockResolvedValue({ responseBody: JSON.stringify({ found: true, id: "gc1" }) }),
		};

		const result = await findGiftcardByUPC({ functions, code: "75855000001" });

		expect(result).toEqual({ $id: "gc1", balance: 0, eventId: null, active: true });
	});
});
