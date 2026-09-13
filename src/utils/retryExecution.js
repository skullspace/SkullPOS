/**
 * One retry for an Appwrite function execution that never actually ran.
 *
 * WHY THIS EXISTS. This install's executor sporadically fails to hand a request to a container. The
 * request then sits until the function's timeout ceiling and comes back failed, having executed
 * nothing -- measured signature: `status: "failed"`, `errors: "Execution timed out."`, and
 * `logs` EMPTY, against successful calls that finish in about 0.09s. Rate is a few percent, rises
 * with concurrency, and is not fixed by warming containers. Until the executor itself is fixed, the
 * register's only defence is to ask again.
 *
 * WHY IT IS SAFE TO ASK AGAIN, and the line this must not cross. A retry is only ever correct for a
 * call that is idempotent or that provably did nothing. Stripe-CreatePaymentIntent sends a Stripe
 * `idempotencyKey` derived from the transaction id, so a retry returns the SAME intent rather than
 * minting a second one; Transaction-RecordPayment carries a per-leg idempotency key for the same
 * reason. Do NOT wrap a call that lacks one -- a retried create-every-time endpoint is how one sale
 * becomes two charges, which is far worse than the failed sale this is trying to prevent.
 *
 * WHAT IT DELIBERATELY DOES NOT RETRY. Anything that ran and produced an answer, including a
 * business rejection ("voucher revoked", "wrong event") and any 4xx. Those are deterministic: asking
 * again just spends another few seconds arriving at the same answer while a customer waits.
 */

/**
 * True when an execution came back having plainly never run. Appwrite resolves `createExecution`
 * normally even for a failed execution, so this inspects the execution rather than relying on a
 * thrown error.
 */
export function isStalledExecution(execution) {
	if (!execution) return false;
	const body = execution.responseBody;
	const ranAndAnswered = typeof body === "string" && body.length > 0;
	if (ranAndAnswered) return false;
	// No body at all AND either an explicit failure or the 0/5xx an un-dispatched execution reports.
	const code = execution.responseStatusCode;
	return execution.status === "failed" || code === 0 || (typeof code === "number" && code >= 500);
}

/** Network-level failures reaching the client are retryable for the same reason: nothing ran. */
export function isRetryableError(error) {
	if (!error) return false;
	const code = error.code ?? error.status;
	// A 4xx is a decision the server made; only a 5xx or a transport failure means "try again".
	if (typeof code === "number" && code >= 400 && code < 500) return false;
	return true;
}

/**
 * Runs `execute` and, if that attempt plainly never ran, runs it exactly ONCE more.
 * `onRetry` is called with the reason, so the caller can surface or log it.
 */
export async function executeWithOneRetry(execute, { onRetry } = {}) {
	let first;
	try {
		first = await execute();
	} catch (error) {
		if (!isRetryableError(error)) throw error;
		if (onRetry) onRetry(error.message || "the request did not complete");
		return execute();
	}
	if (isStalledExecution(first)) {
		if (onRetry) onRetry("the server accepted the request but never ran it");
		return execute();
	}
	return first;
}
