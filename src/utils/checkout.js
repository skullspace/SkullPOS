// if on localhost, use test mode
const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

const test = isLocalhost;

// See AppwriteFunctions/functions/Transaction-ApplyGiftcard.
const APPLY_GIFTCARD_FUNCTION_ID = "6a9c5c2421431904c1d0";

/**
 * Applies a giftcard payment to a pending transaction via the
 * Transaction-ApplyGiftcard function -- this re-reads the transaction and
 * giftcard fresh server-side (never trusts a client-cached balance) and
 * decrements the giftcard atomically with the transaction update, so the
 * client never needs write access to either collection.
 *
 * @returns {Promise<{ok: boolean, applied?: number, remaining?: number, status?: string, paymentMethod?: string, error?: string}>}
 */
export async function applyGiftcardToTransaction({ functions, transactionId, giftcardId }) {
	const response = await functions.createExecution({
		functionId: APPLY_GIFTCARD_FUNCTION_ID,
		body: JSON.stringify({ transactionId, giftcardId }),
	});
	return JSON.parse(response.responseBody || "{}");
}

export default function createCheckout(deps) {
	const {
		databases,
		config,
		functions,
		uniqueId,
		getCart,
		getTotal,
		getDiscount,
		getCreatedBy,
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

		// Note: no itemsRel here -- that relationship is bound to the retired
		// Items_old collection at the schema level and would mismatch pos_items
		// IDs. The `cart` snapshot below already carries full item data.
		const transaction = {
			cart: JSON.stringify(getCart ? getCart() : []),
			payment_due: parseInt(getTotal ? getTotal() : 0),
			payment_method: paymentMethod,
			tip: 0,
			discount: parseInt(getDiscount ? getDiscount() : 0),
			status: "pending",
			testing: test,
			total: getTotal ? getTotal() : 0,
			CreatedBy: getCreatedBy ? getCreatedBy() : null,
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
				// apply giftcard balance (may be full or partial) -- server-side,
				// so the actual current balance is what's charged, not whatever
				// this client last cached.
				const gift = getGiftcard ? getGiftcard() : null;
				if (!gift) {
					setCheckoutError && setCheckoutError("No giftcard loaded");
					setTransactionInProgress && setTransactionInProgress(false);
					return;
				}

				let applyResult;
				try {
					applyResult = await applyGiftcardToTransaction({
						functions,
						transactionId: document.$id,
						giftcardId: gift.$id,
					});
					if (!applyResult.ok) throw new Error(applyResult.error || "Failed to apply giftcard");
				} catch (err) {
					console.error("Error applying giftcard:", err);
					setCheckoutError && setCheckoutError("Failed to apply giftcard");
					setTransactionInProgress && setTransactionInProgress(false);
					return;
				}

				// update local usage state so UI can reflect partial/full
				setGiftcardUsage && setGiftcardUsage({ applied: applyResult.applied, remaining: applyResult.remaining });

				if (applyResult.remaining <= 0) {
					// fully paid by giftcard — transaction already recorded as
					// complete and the giftcard already decremented, server-side.
					setGiftcard && setGiftcard(null);
					setGiftcardUsage && setGiftcardUsage(null);
					setTransactionInProgress && setTransactionInProgress(false);
					clearCart && clearCart();
					setCheckoutSuccess && setCheckoutSuccess(true);
					setPaymentMethod && setPaymentMethod("stripe");
					return;
				}

				// partial: charge the remaining amount via card
				if (handleCardPayment) {
					try {
						// pass the remaining amount (in cents) to the card handler
						let res = await handleCardPayment(document.$id, false, applyResult.remaining);

						if (!res) {
							setTransactionInProgress && setTransactionInProgress(false);
							return;
						}

						// transaction succeeded — remove giftcard from UI now
						setGiftcard && setGiftcard(null);
						setGiftcardUsage && setGiftcardUsage(null);
						return;
					} catch (err) {
						// card charge failed — giftcard portion was already applied
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
