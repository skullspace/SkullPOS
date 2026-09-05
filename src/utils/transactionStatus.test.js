import { setTransactionStatus } from "./transactionStatus";

describe("setTransactionStatus", () => {
	test("posts transactionId and status, returns the parsed result", async () => {
		const functions = {
			createExecution: jest
				.fn()
				.mockResolvedValue({ responseBody: JSON.stringify({ ok: true, status: "cancelled" }) }),
		};

		const result = await setTransactionStatus({ functions, transactionId: "t1", status: "cancelled" });

		expect(result).toEqual({ ok: true, status: "cancelled" });
		expect(functions.createExecution).toHaveBeenCalledWith({
			functionId: "6a9c65091672e55d90b1",
			body: JSON.stringify({ transactionId: "t1", status: "cancelled" }),
		});
	});

	test("surfaces a server-reported error (e.g. rejecting a non-cancel status)", async () => {
		const functions = {
			createExecution: jest
				.fn()
				.mockResolvedValue({ responseBody: JSON.stringify({ ok: false, error: "only cancellation is allowed" }) }),
		};

		const result = await setTransactionStatus({ functions, transactionId: "t1", status: "complete" });

		expect(result).toEqual({ ok: false, error: "only cancellation is allowed" });
	});
});
