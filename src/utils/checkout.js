// if on localhost, use test mode
const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

const test = isLocalhost;

export default function createCheckout(deps) {
	const {
		databases,
		config,
		uniqueId,
		getCart,
		getTotal,
		getDiscount,
		getPaymentMethod,
		getGiftcard,
		setGiftcard,
		setGiftcardUsage,
		clearCart,
		setCheckoutSuccess,
		setPaymentMethod,
		transactionIdRef,
		setTransactionInProgress,
		setCheckoutError,
		setCashModalOpen,
		handleCardPayment,
	} = deps;

	return async function checkout() {
		setTransactionInProgress && setTransactionInProgress(true);

		if (!getPaymentMethod) {
			setCheckoutError && setCheckoutError("Please select a payment method");
			return;
		}

		const paymentMethod = getPaymentMethod();

		let itemsRelList = (getCart ? getCart() : []).map((item) => item.$id);

		const transaction = {
			cart: JSON.stringify(getCart ? getCart() : []),
			payment_due: parseInt(getTotal ? getTotal() : 0),
			payment_method: paymentMethod,
			tip: 0,
			discount: parseInt(getDiscount ? getDiscount() : 0),
			status: "pending",
			testing: test,
			itemsRel: itemsRelList,
			total: getTotal ? getTotal() : 0,
		};

		try {
			const document = await databases.createDocument(
				config.databases.bar.id,
				config.databases.bar.collections.transactions,
				uniqueId(),
				transaction,
			);

			if (transactionIdRef) transactionIdRef.current = document.$id;

			if (paymentMethod === "cash") {
				setTransactionInProgress && setTransactionInProgress(false);
				setCashModalOpen && setCashModalOpen(true);
				return;
			}

			if (paymentMethod === "giftcard") {
				// apply giftcard balance (may be full or partial)
				const gift = getGiftcard ? getGiftcard() : null;
				if (!gift) {
					setCheckoutError && setCheckoutError("No giftcard loaded");
					setTransactionInProgress && setTransactionInProgress(false);
					return;
				}

				const paymentDue = parseInt(getTotal ? getTotal() : 0);
				const giftBalance = parseInt(gift.balance || 0);
				const applied = Math.min(giftBalance, paymentDue);
				const remaining = paymentDue - applied;

				try {
					// record applied giftcard on transaction (status: pending if remainder)
					await databases.updateDocument({
						databaseId: config.databases.bar.id,
						collectionId: config.databases.bar.collections.transactions,
						documentId: document.$id,
						data: {
							giftcards: [gift.$id],
							giftcard_amount: applied,
							payment_due: remaining,
							payment_method: remaining > 0 ? "giftcard+stripe" : "giftcard",
							status: remaining > 0 ? "pending" : "complete",
						},
					});

					// update local usage state so UI can reflect partial/full
					setGiftcardUsage && setGiftcardUsage({ applied, remaining });
				} catch (err) {
					console.error("Error recording giftcard on transaction:", err);
					setCheckoutError && setCheckoutError("Failed to apply giftcard");
					setTransactionInProgress && setTransactionInProgress(false);
					return;
				}

				if (remaining <= 0) {
					// fully paid by giftcard — transaction recorded as complete.
					// Remove giftcard from UI now (transaction succeeded), then attempt to decrement in DB.
					try {
						setGiftcard && setGiftcard(null);
						setGiftcardUsage && setGiftcardUsage(null);

						const newBalance = giftBalance - applied;
						await databases.updateDocument({
							databaseId: config.databases.bar.id,
							collectionId: config.databases.bar.collections.giftcards,
							documentId: gift.$id,
							data: { balance: newBalance },
						});

						setTransactionInProgress && setTransactionInProgress(false);
						clearCart && clearCart();
						setCheckoutSuccess && setCheckoutSuccess(true);
						setPaymentMethod && setPaymentMethod("stripe");
						return;
					} catch (err) {
						console.error("Error decrementing giftcard for full-pay:", err);
						// transaction is complete, but updating the giftcard failed — remove it from UI anyway and surface error
						setGiftcard && setGiftcard(null);
						setGiftcardUsage && setGiftcardUsage(null);
						setCheckoutError &&
							setCheckoutError(
								"Transaction complete but failed to update giftcard balance. Please reconcile.",
							);
						setTransactionInProgress && setTransactionInProgress(false);
						return;
					}
				}

				// partial: charge the remaining amount via card
				if (handleCardPayment) {
					try {
						// pass the remaining amount (in cents) to the card handler
						let res = await handleCardPayment(document.$id, false, remaining);

						if (!res) {
							setTransactionInProgress && setTransactionInProgress(false);
							return;
						}

						// transaction succeeded — remove giftcard from UI now
						setGiftcard && setGiftcard(null);
						setGiftcardUsage && setGiftcardUsage(null);

						// attempt to decrement giftcard balance in DB; if this fails, surface error but keep giftcard removed
						try {
							const newBalance = giftBalance - applied;
							await databases.updateDocument({
								databaseId: config.databases.bar.id,
								collectionId: config.databases.bar.collections.giftcards,
								documentId: gift.$id,
								data: { balance: newBalance },
							});
						} catch (decErr) {
							console.error("Failed to decrement giftcard after successful charge:", decErr);
							setCheckoutError &&
								setCheckoutError(
									"Card charged but failed to update giftcard balance. Please reconcile.",
								);
						}
						return;
					} catch (err) {
						// card charge failed — do not touch giftcard balance
						setTransactionInProgress && setTransactionInProgress(false);
						return;
					}
				}
			}

			if (paymentMethod === "stripe") {
				handleCardPayment && handleCardPayment(document.$id);
				return;
			}

			// fallback: clear in-progress state
			setTransactionInProgress && setTransactionInProgress(false);
		} catch (err) {
			console.error("Error creating transaction:", err);
			setCheckoutError && setCheckoutError("Failed to create transaction");
			setTransactionInProgress && setTransactionInProgress(false);
			throw err;
		}
	};
}
