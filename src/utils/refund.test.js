import { refundTransaction } from "./refund";

describe("refundTransaction", () => {
	test("throws without ever calling the server when no transaction is given", async () => {
		const functions = { createExecution: jest.fn() };

		await expect(refundTransaction({ functions, transaction: null })).rejects.toThrow("No transaction provided");
		expect(functions.createExecution).not.toHaveBeenCalled();
	});

	test("posts the transaction id and resolves true on success", async () => {
		const functions = {
			createExecution: jest.fn().mockResolvedValue({ responseBody: JSON.stringify({ ok: true, legs: [] }) }),
		};

		const result = await refundTransaction({ functions, transaction: { $id: "t1" } });

		expect(result).toBe(true);
		expect(functions.createExecution).toHaveBeenCalledWith({
			functionId: "6a9b7671df1f504a084e",
			body: JSON.stringify({ transactionId: "t1" }),
		});
	});

	test("throws the server's error message on a clean failure", async () => {
		const functions = {
			createExecution: jest
				.fn()
				.mockResolvedValue({ responseBody: JSON.stringify({ ok: false, error: "already refunded" }) }),
		};

		await expect(refundTransaction({ functions, transaction: { $id: "t1" } })).rejects.toThrow("already refunded");
	});

	test("falls back to a generic message when the server gives no error text", async () => {
		const functions = { createExecution: jest.fn().mockResolvedValue({ responseBody: JSON.stringify({ ok: false }) }) };

		await expect(refundTransaction({ functions, transaction: { $id: "t1" } })).rejects.toThrow("Refund failed");
	});
});
