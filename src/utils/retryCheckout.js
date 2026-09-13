/**
 * retryCheckout.js - Retries a failed payment leg on an already-created transaction.
 *
 * Built as an injectable-deps factory (same pattern as checkout.js / handleCardPayment.js) so
 * this can be unit tested without rendering pos.js.
 *
 * The one path this exists specifically to get right: a giftcard partially covers the sale, the
 * remaining card leg then fails, and the cashier hits Retry. The giftcard leg already succeeded
 * server-side (its balance is already decremented there) -- retrying must charge only the actual
 * remaining amount recorded in `giftcardUsage` (set by checkout.js's giftcard branch), never
 * recompute from the full cart total / the giftcard's original (now-stale) balance, and never
 * re-apply the giftcard a second time.
 */
import { recordPayment, describeCleanLegFailure } from "./splitPayment";
import { planGiftcardLeg } from "./giftcard";

export default function createRetryCheckout(deps) {
	const {
		transactionIdRef,
		getCardChargeUnconfirmed,
		getPaymentMethod,
		getGiftcard,
		getGiftcardUsage,
		getTotal,
		functions,
		setGiftcard,
		setGiftcardUsage,
		setTransactionInProgress,
		setCheckoutError,
		setCheckoutSuccess,
		setPaymentMethod,
		setCashModalOpen,
		clearCart,
		handleCardPayment,
	} = deps;

	return function retryCheckout() {
		setCheckoutError && setCheckoutError(false);

		if (!transactionIdRef || !transactionIdRef.current) {
			setCheckoutError && setCheckoutError("No transaction available to retry");
			return;
		}

		// A card that may have already been charged must never be re-charged blindly -- this
		// shouldn't be reachable since the ErrorModal hides Retry in this state, but guard here too.
		if (getCardChargeUnconfirmed && getCardChargeUnconfirmed()) {
			return;
		}

		setTransactionInProgress && setTransactionInProgress(true);

		const paymentMethod = getPaymentMethod ? getPaymentMethod() : null;

		if (paymentMethod === "stripe") {
			// reuse existing transaction id and re-attempt charging the card
			handleCardPayment && handleCardPayment(transactionIdRef.current, true);
			return;
		}

		if (paymentMethod === "giftcard") {
			const usage = getGiftcardUsage ? getGiftcardUsage() : null;

			// The giftcard leg already succeeded server-side (a partial payment) -- only the
			// card leg for the remainder failed. Retry must charge exactly that remaining
			// amount, never recompute against the full cart total or the giftcard's original
			// (now-stale) balance -- that would double-apply the giftcard.
			if (usage && usage.remaining > 0) {
				if (!handleCardPayment) {
					setTransactionInProgress && setTransactionInProgress(false);
					return;
				}
				Promise.resolve(handleCardPayment(transactionIdRef.current, true, usage.remaining)).then((res) => {
					if (res) {
						// card retry succeeded -- giftcard leg is done, remove it from UI
						setGiftcard && setGiftcard(null);
						setGiftcardUsage && setGiftcardUsage(null);
					}
				});
				return;
			}

			// Nothing applied yet -- the original giftcard apply itself must have failed before
			// any leg was recorded server-side. Apply it from scratch, same as the initial
			// checkout attempt.
			(async () => {
				const gift = getGiftcard ? getGiftcard() : null;
				if (!gift) {
					setCheckoutError && setCheckoutError("No giftcard loaded");
					setTransactionInProgress && setTransactionInProgress(false);
					return;
				}

				// Same plan as the first attempt (see checkout.js): a naive min(balance, total)
				// can leave a 1-50c card remainder the reader refuses, which is what made Retry
				// reproduce the original failure forever instead of getting the sale through.
				const plan = planGiftcardLeg({ total: parseInt(getTotal ? getTotal() : 0) || 0, balance: gift.balance });
				if (!plan.ok) {
					setCheckoutError && setCheckoutError(plan.error);
					setTransactionInProgress && setTransactionInProgress(false);
					return;
				}

				try {
					const applyAmount = plan.applyAmount;
					const result = await recordPayment({
						functions,
						transactionId: transactionIdRef.current,
						method: "giftcard",
						amount: applyAmount,
						giftcardId: gift.$id,
					});
					if (!result.ok) {
						throw new Error(
							describeCleanLegFailure({
								method: "giftcard",
								amount: applyAmount,
								error: result.error || "Failed to retry giftcard",
							}),
						);
					}

					// record what actually got applied so a *second* retry (if the card fails
					// again) charges the real remainder, not the full total once more
					setGiftcardUsage && setGiftcardUsage({ applied: applyAmount, remaining: result.remaining });

					if (result.remaining <= 0) {
						setGiftcard && setGiftcard(null);
						setGiftcardUsage && setGiftcardUsage(null);
						setTransactionInProgress && setTransactionInProgress(false);
						setCheckoutSuccess && setCheckoutSuccess(true);
						clearCart && clearCart();
						setPaymentMethod && setPaymentMethod("stripe");
						return;
					}

					if (handleCardPayment) {
						const res = await handleCardPayment(transactionIdRef.current, true, result.remaining);
						if (res) {
							setGiftcard && setGiftcard(null);
							setGiftcardUsage && setGiftcardUsage(null);
						}
						return;
					}

					setTransactionInProgress && setTransactionInProgress(false);
				} catch (err) {
					console.error("Retry giftcard error", err);
					// Surface the actual reason, not a fixed string -- it's the only thing that
					// tells staff whether the card's balance may already have been debited.
					setCheckoutError && setCheckoutError(err.message || "Failed to retry giftcard");
					setTransactionInProgress && setTransactionInProgress(false);
				}
			})();
			return;
		}

		if (paymentMethod === "cash") {
			// reopen cash modal so user can re-submit cash payment
			setCashModalOpen && setCashModalOpen(true);
			setTransactionInProgress && setTransactionInProgress(false);
			return;
		}

		// fallback: clear in-progress state
		setTransactionInProgress && setTransactionInProgress(false);
	};
}
