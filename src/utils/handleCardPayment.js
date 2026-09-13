/**
 * handleCardPayment.js - Card payment processing logic
 *
 * Handles Stripe card payments:
 * - Charges card via Stripe Terminal
 * - Records transaction in database
 * - Shows payment status to user
 * - Supports retry logic for failed payments
 *
 * This is a factory function that creates a handler with injected dependencies,
 * allowing flexible testing and configuration.
 */

import { recordPaymentWithRetry, describeUnknownPaymentFailure } from "./splitPayment";

/**
 * Factory function to create card payment handler
 * 
 * @param {Object} deps - Dependencies object
 * @param {Function} deps.chargeCard - Function to charge card via Stripe Terminal
 * @param {Object} deps.terminal - Stripe Terminal instance
 * @param {Object} deps.functions - Appwrite Functions client
 * @param {Function} deps.setStripeAlert - Function to show alerts
 * @param {Function} deps.setTransactionInProgress - Update transaction state
 * @param {Function} deps.setCheckoutError - Set checkout error message
 * @param {Function} deps.setCheckoutSuccess - Set checkout success state
 * @param {Function} deps.setCardChargeUnconfirmed - Flags that a charge succeeded but wasn't confirmed saved (blocks the ErrorModal's Retry, which would re-charge)
 * @param {Function} deps.clearCart - Clear shopping cart
 * @param {Function} deps.setPaymentMethod - Reset payment method
 * @param {Function} deps.formatCAD - Format currency function
 * @param {Function} deps.getTotal - Get current cart total
 * 
 * @returns {Function} Card payment handler function
 */
export default function createHandleCardPayment(deps) {
	const {
		chargeCard,
		terminal,
		functions,
		setStripeAlert,
		setTransactionInProgress,
		setCheckoutError,
		setCheckoutSuccess,
		setCardChargeUnconfirmed,
		clearCart,
		setPaymentMethod,
		formatCAD,
		getTotal,
		// optional: allow charging a specific amount (used for partial giftcard flows)
	} = deps;

	/**
	 * Process card payment
	 * 
	 * Flow:
	 * 1. Validate terminal is ready
	 * 2. Call Stripe Terminal to charge card
	 * 3. Update transaction record in database with payment info
	 * 4. Show success/error message
	 * 5. Clear cart on success
	 * 
	 * @param {string} transactionId - Database ID of transaction to update
	 * @param {boolean} [retrying=false] - If true, use existing charge intent
	 * @param {number} [amountToCharge=null] - Optional: charge specific amount in cents
	 *                                         If null, uses getTotal()
	 */
	return async function handleCardPayment(
		transactionId,
		retrying = false,
		amountToCharge = null
	) {
		// Ensure terminal is available
		if (!terminal) {
			setCheckoutError &&
				setCheckoutError("Stripe terminal not connected");
			return;
		}

		// Determine amount to charge
		const total =
			amountToCharge != null ? amountToCharge : getTotal ? getTotal() : 0;

		// Cleared at the start of every attempt -- only set again below if
		// *this* attempt's charge succeeds but recording it doesn't.
		setCardChargeUnconfirmed && setCardChargeUnconfirmed(false);

		try {
			// Call Stripe Terminal to charge card. The transaction id is threaded all the
			// way down into Stripe-CreatePaymentIntent's body so the intent carries
			// `metadata.transactionId` -- Transaction-RecordPayment refuses any stripe leg
			// whose intent doesn't, and by then the money is already captured.
			const result = await chargeCard(total, retrying, transactionId);

			// Record the payment server-side -- verified independently against
			// the real Stripe API there, not trusted from this client response.
			//
			// `amount` here is deliberately TIP-EXCLUSIVE: it's what the sale is
			// for, not what the reader ended up capturing. With
			// `update_payment_intent: true` (see stripe.js) the customer can add a
			// tip on the reader, so the PaymentIntent's own `amount` is
			// base + tip while this leg -- which is what gets subtracted from
			// `payment_due` -- must stay the base. The tip travels separately, on
			// Transactions.tip, which the server derives from
			// `paymentIntent.amount_details.tip.amount`. Sending base + tip here
			// instead would overshoot payment_due and be rejected.
			//
			// Retries on a transport failure. recordPaymentWithRetry generates one
			// `legId` of its own and holds it constant across its attempts (it is
			// NOT supplied from here), so the server can recognise a redelivery of
			// THIS leg rather than appending it twice. That dedupe only exists once
			// Transaction-RecordPayment's legId handling is deployed -- POS and that
			// function are one atomic deploy. If every attempt still fails, the card
			// was charged for real: don't claim success, and don't let staff blindly
			// retry (which would re-charge it).
			let recordError = null;
			try {
				const recordResult = await recordPaymentWithRetry({
					functions,
					transactionId,
					method: "stripe",
					amount: total,
					paymentIntentId: result.id,
				});
				if (!recordResult.ok) {
					recordError = new Error(recordResult.error || "Failed to record payment");
				}
			} catch (err) {
				recordError = err;
			}

			if (recordError) {
				console.error("Failed to record card payment:", recordError);
				setTransactionInProgress && setTransactionInProgress(false);
				setCardChargeUnconfirmed && setCardChargeUnconfirmed(true);
				setCheckoutError &&
					setCheckoutError(
						recordError.name === "RecordPaymentUnknownError"
							? describeUnknownPaymentFailure(recordError)
							: `Card was charged ${formatCAD(total)} but failed to save: ${recordError.message}. ` +
								`Do not charge again -- check the Transactions view (payment ${result.id}).`,
					);
				return;
			}

			// Show success message with payment details
			setStripeAlert &&
				setStripeAlert({
					active: true,
					message:
						"Payment Successful: " +
						formatCAD(result.amount) +
						" Total: " +
						formatCAD(total) +
						" + Tip: " +
						formatCAD(result.amount_details?.tip?.amount || 0),
					type: "success",
				});

			// Update UI state
			setTransactionInProgress && setTransactionInProgress(false);
			setCheckoutSuccess && setCheckoutSuccess(true);
			clearCart && clearCart();
			setPaymentMethod && setPaymentMethod("stripe");
			return result;
		} catch (error) {
			// Handle card payment error
			setTransactionInProgress && setTransactionInProgress(false);

			// Show detailed error message -- omit the code prefix when there isn't one. A
			// Stripe decline carries `.code` (e.g. "card_declined"), but a plain network/JS
			// error doesn't, and used to show cashiers a literal "undefined\n<message>" string.
			setCheckoutError &&
				setCheckoutError(
					error?.code ? error.code + "\n" + error.message : error?.message || "Card payment failed",
				);

			console.log("Error from handleCardPayment:", error);
		}
	};
}
