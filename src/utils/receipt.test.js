import { emailReceipt } from "./receipt";

describe("emailReceipt", () => {
	test("posts the transaction id and email, resolves true on success", async () => {
		const functions = {
			createExecution: jest.fn().mockResolvedValue({ responseBody: JSON.stringify({ ok: true }) }),
		};

		const result = await emailReceipt({ functions, transactionId: "t1", email: "customer@example.com" });

		expect(result).toBe(true);
		expect(functions.createExecution).toHaveBeenCalledWith({
			functionId: "6a9cd1ed552967ba3560",
			body: JSON.stringify({ transactionId: "t1", email: "customer@example.com" }),
		});
	});

	test("throws the server's error message on a clean failure", async () => {
		const functions = {
			createExecution: jest
				.fn()
				.mockResolvedValue({ responseBody: JSON.stringify({ ok: false, error: "invalid email" }) }),
		};

		await expect(
			emailReceipt({ functions, transactionId: "t1", email: "bad" }),
		).rejects.toThrow("invalid email");
	});

	test("falls back to a generic message when the server gives no error text", async () => {
		const functions = { createExecution: jest.fn().mockResolvedValue({ responseBody: JSON.stringify({ ok: false }) }) };

		await expect(
			emailReceipt({ functions, transactionId: "t1", email: "customer@example.com" }),
		).rejects.toThrow("Failed to send receipt");
	});
});
