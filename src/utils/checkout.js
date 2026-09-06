import { recordPayment } from "./splitPayment";

// if on localhost, use test mode
const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

const test = isLocalhost;

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
		getChannel,
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
		onSplitStarted,
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
			// "pos" (regular staff register) or "self_checkout" (customer
			// kiosk) -- defaults to "pos" so every existing caller of this
			// factory needs no changes. Lets Sales-Report compare the two, and
			// lets Transaction-RecordPayment refuse a non-card leg on a
			// self-checkout sale server-side.
			channel: getChannel ? getChannel() : "pos",
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

			if (paymentMethod === "split") {
				// Hand off to SplitPaymentPanel -- it drives the rest via
				// recordPayment, one leg at a time, until payment_due hits 0.
				setTransactionInProgress && setTransactionInProgress(false);
				onSplitStarted && onSplitStarted(document.$id, transaction.total);
				return;
			}

			if (paymentMethod === "giftcard") {
				// apply as much of the giftcard's balance as covers the total
				// (may be full or partial) -- the actual current balance is
				// re-checked server-side, not whatever this client last cached.
				const gift = getGiftcard ? getGiftcard() : null;
				if (!gift) {
					setCheckoutError && setCheckoutError("No giftcard loaded");
					setTransactionInProgress && setTransactionInProgress(false);
					return;
				}

				const applyAmount = Math.min(parseInt(gift.balance) || 0, parseInt(getTotal ? getTotal() : 0));

				let applyResult;
				try {
					applyResult = await recordPayment({
						functions,
						transactionId: document.$id,
						method: "giftcard",
						amount: applyAmount,
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
				setGiftcardUsage && setGiftcardUsage({ applied: applyAmount, remaining: applyResult.remaining });

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
