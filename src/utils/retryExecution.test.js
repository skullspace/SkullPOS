import { executeWithOneRetry, isStalledExecution, isRetryableError } from "./retryExecution";

const ran = (body) => ({ status: "completed", responseStatusCode: 200, responseBody: body });
const stalled = () => ({ status: "failed", responseStatusCode: 500, responseBody: "" });

describe("isStalledExecution", () => {
	// The measured production signature: failed, timed out, and NOTHING logged or returned.
	it("recognises an execution that never ran", () => {
		expect(isStalledExecution(stalled())).toBe(true);
		expect(isStalledExecution({ status: "failed", responseStatusCode: 0, responseBody: "" })).toBe(true);
	});

	// The line that must not be crossed: a function that ran and said no is NOT retried. Asking
	// again only spends more of the customer's time arriving at the same refusal.
	it("does not treat a real answer as a stall, even a failing one", () => {
		expect(isStalledExecution(ran('{"error":"This voucher has been revoked"}'))).toBe(false);
		expect(
			isStalledExecution({ status: "failed", responseStatusCode: 400, responseBody: '{"error":"bad"}' }),
		).toBe(false);
	});

	it("is safe on a missing execution", () => {
		expect(isStalledExecution(undefined)).toBe(false);
		expect(isStalledExecution(null)).toBe(false);
	});
});

describe("isRetryableError", () => {
	it("retries transport failures", () => {
		expect(isRetryableError(new Error("network down"))).toBe(true);
	});

	it("does not retry a decision the server made", () => {
		expect(isRetryableError({ code: 401, message: "unauthorised" })).toBe(false);
		expect(isRetryableError({ code: 404, message: "missing" })).toBe(false);
	});

	it("retries a server-side fault", () => {
		expect(isRetryableError({ code: 503, message: "unavailable" })).toBe(true);
	});
});

describe("executeWithOneRetry", () => {
	it("does not retry when the first attempt actually ran", async () => {
		const execute = jest.fn().mockResolvedValue(ran('{"intent":{"id":"pi_1"}}'));
		const result = await executeWithOneRetry(execute);
		expect(execute).toHaveBeenCalledTimes(1);
		expect(result.responseBody).toContain("pi_1");
	});

	it("retries exactly once when the first attempt never ran, and returns the second", async () => {
		const execute = jest
			.fn()
			.mockResolvedValueOnce(stalled())
			.mockResolvedValueOnce(ran('{"intent":{"id":"pi_1"}}'));
		const onRetry = jest.fn();
		const result = await executeWithOneRetry(execute, { onRetry });
		expect(execute).toHaveBeenCalledTimes(2);
		expect(onRetry).toHaveBeenCalledTimes(1);
		expect(result.responseBody).toContain("pi_1");
	});

	// ONE retry, not a loop. A stalling executor must not turn one sale into an unbounded queue of
	// attempts while the cashier waits.
	it("gives up after the second attempt rather than looping", async () => {
		const execute = jest.fn().mockResolvedValue(stalled());
		const result = await executeWithOneRetry(execute);
		expect(execute).toHaveBeenCalledTimes(2);
		expect(isStalledExecution(result)).toBe(true);
	});

	it("retries a transport failure once", async () => {
		const execute = jest
			.fn()
			.mockRejectedValueOnce(new Error("socket hang up"))
			.mockResolvedValueOnce(ran('{"ok":true}'));
		const result = await executeWithOneRetry(execute);
		expect(execute).toHaveBeenCalledTimes(2);
		expect(result.responseBody).toContain("ok");
	});

	it("rethrows a 4xx without retrying", async () => {
		const execute = jest.fn().mockRejectedValue({ code: 401, message: "unauthorised" });
		await expect(executeWithOneRetry(execute)).rejects.toMatchObject({ code: 401 });
		expect(execute).toHaveBeenCalledTimes(1);
	});
});
