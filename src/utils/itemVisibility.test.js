import { setItemEnabled } from "./itemVisibility";

describe("setItemEnabled", () => {
	test("posts itemId and enabled, returns the parsed result", async () => {
		const functions = {
			createExecution: jest.fn().mockResolvedValue({ responseBody: JSON.stringify({ ok: true, enabled: true }) }),
		};

		const result = await setItemEnabled({ functions, itemId: "item1", enabled: true });

		expect(result).toEqual({ ok: true, enabled: true });
		expect(functions.createExecution).toHaveBeenCalledWith({
			functionId: "6a9c6aad6d4a29ab66ee",
			body: JSON.stringify({ itemId: "item1", enabled: true }),
		});
	});

	test("passes a field through when given", async () => {
		const functions = {
			createExecution: jest.fn().mockResolvedValue({ responseBody: JSON.stringify({ ok: true, enabled: true }) }),
		};

		await setItemEnabled({ functions, itemId: "item1", enabled: true, field: "enabled_pos" });

		expect(functions.createExecution).toHaveBeenCalledWith({
			functionId: "6a9c6aad6d4a29ab66ee",
			body: JSON.stringify({ itemId: "item1", enabled: true, field: "enabled_pos" }),
		});
	});

	test("surfaces a server-reported error", async () => {
		const functions = {
			createExecution: jest.fn().mockResolvedValue({ responseBody: JSON.stringify({ ok: false, error: "not found" }) }),
		};

		const result = await setItemEnabled({ functions, itemId: "missing", enabled: false });

		expect(result).toEqual({ ok: false, error: "not found" });
	});
});
