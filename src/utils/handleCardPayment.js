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

import { recordCardPayment } from "./transactionStatus";

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

		try {
			// Call Stripe Terminal to charge card
			const result = await chargeCard(total, retrying);

			// Record the payment server-side -- verified independently against
			// the real Stripe API there, not trusted from this client response.
			try {
				const recordResult = await recordCardPayment({
					functions,
					transactionId,
					paymentIntentId: result.id,
				});
				if (!recordResult.ok) {
					console.error("Failed to record card payment:", recordResult.error);
				}
			} catch (dbErr) {
				console.error("Failed to record card payment:", dbErr);
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
			
			// Show detailed error message
			if (error?.decline_code) {
				setCheckoutError &&
					setCheckoutError(error.code + "\n" + error.message);
				console.log("Throwing error from handleCardPayment:", error);
			}
			setCheckoutError &&
				setCheckoutError(error.code + "\n" + error.message);

			console.log("Throwing error from handleCardPayment:", error);
		}
	};
}
