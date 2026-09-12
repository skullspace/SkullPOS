import { fetchMySales } from "./bartenderSales";

describe("fetchMySales", () => {
	test("calls the Bartender-Sales function with the given bartenderId and returns the parsed result", async () => {
		const functions = {
			createExecution: jest.fn().mockResolvedValue({
				responseBody: JSON.stringify({
					salesTotal: 5000,
					tipsTotal: 500,
					transactionCount: 3,
					transactions: [{ $id: "t1" }],
				}),
			}),
		};

		const result = await fetchMySales({ functions, bartenderId: "bt1" });

		expect(functions.createExecution).toHaveBeenCalledWith({
			functionId: "bartender-sales",
			body: JSON.stringify({ bartenderId: "bt1" }),
		});
		expect(result).toEqual({
			salesTotal: 5000,
			tipsTotal: 500,
			transactionCount: 3,
			transactions: [{ $id: "t1" }],
		});
	});

	test("throws the server's own error message instead of returning a partial/empty result", async () => {
		const functions = {
			createExecution: jest.fn().mockResolvedValue({
				responseBody: JSON.stringify({ error: "bartenderId is required" }),
			}),
		};

		await expect(fetchMySales({ functions, bartenderId: null })).rejects.toThrow("bartenderId is required");
	});

	test("defaults to an empty object when the response has no body", async () => {
		const functions = { createExecution: jest.fn().mockResolvedValue({}) };

		const result = await fetchMySales({ functions, bartenderId: "bt1" });

		expect(result).toEqual({});
	});

	test("propagates a network/transport error rather than swallowing it", async () => {
		const functions = { createExecution: jest.fn().mockRejectedValue(new Error("timeout")) };

		await expect(fetchMySales({ functions, bartenderId: "bt1" })).rejects.toThrow("timeout");
	});
});
