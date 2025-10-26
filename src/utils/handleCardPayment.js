export default function createHandleCardPayment(deps) {
	const {
		chargeCard,
		terminal,
		databases,
		config,
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

	return async function handleCardPayment(
		transactionId,
		retrying = false,
		amountToCharge = null
	) {
		// ensure terminal is available
		if (!terminal) {
			setCheckoutError &&
				setCheckoutError("Stripe terminal not connected");
			return;
		}

		const total =
			amountToCharge != null ? amountToCharge : getTotal ? getTotal() : 0;

		try {
			const result = await chargeCard(total, retrying);

			// update transaction record
			try {
				await databases.updateDocument({
					databaseId: config.databases.bar.id,
					collectionId: config.databases.bar.collections.transactions,
					documentId: transactionId,
					data: {
						status: "complete",
						tip: parseInt(result.amount_details?.tip?.amount || 0),
						stripe_id: result.id,
						transaction_data: JSON.stringify(result),
					},
				});
			} catch (dbErr) {
				console.error("Failed to update transaction document:", dbErr);
			}

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

			setTransactionInProgress && setTransactionInProgress(false);
			setCheckoutSuccess && setCheckoutSuccess(true);
			clearCart && clearCart();
			setPaymentMethod && setPaymentMethod("stripe");
			return result;
		} catch (error) {
			setTransactionInProgress && setTransactionInProgress(false);
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
