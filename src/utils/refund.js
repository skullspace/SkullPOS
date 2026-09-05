/**
 * refund.js - Refund orchestration for completed transactions
 *
 * A refund here is always for the whole transaction (no partial/itemized
 * refunds). Depending on how it was paid:
 *  - card portion (transaction.stripe_id present): refunded via the
 *    Stripe-RefundPayment Appwrite Function -- the Stripe secret key never
 *    touches the client, same pattern as Create/CancelPaymentIntent.
 *  - giftcard portion (transaction.giftcard_amount > 0): credited back to
 *    the giftcard's balance directly.
 *  - cash: no external action -- staff hands the cash back physically.
 * The transaction's own `status` is then set to "refunded".
 */

const isLocalhost =
	window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
const test = isLocalhost;

// See AppwriteFunctions/functions/Stripe-RefundPayment.
export const STRIPE_REFUND_FUNCTION_ID = "6a9b7671df1f504a084e";

export async function refundTransaction({ databases, config, functions, transaction }) {
	if (!transaction) throw new Error("No transaction provided");
	if (transaction.status === "refunded") {
		throw new Error("Transaction has already been refunded");
	}
	if (transaction.status !== "complete") {
		throw new Error(`Only completed transactions can be refunded (current status: ${transaction.status})`);
	}

	// 1. Card portion
	if (transaction.stripe_id) {
		if (!STRIPE_REFUND_FUNCTION_ID || STRIPE_REFUND_FUNCTION_ID === "REPLACE_AFTER_DEPLOY") {
			throw new Error(
				"Card refund function isn't configured yet -- set STRIPE_REFUND_FUNCTION_ID in refund.js",
			);
		}

		const response = await functions.createExecution({
			functionId: STRIPE_REFUND_FUNCTION_ID,
			body: JSON.stringify({
				test: test ? "test" : "",
				intent: transaction.stripe_id,
				amount: parseInt(transaction.payment_due) || undefined,
			}),
		});
		const data = JSON.parse(response.responseBody || "{}");
		if (data.error) {
			throw new Error(`Stripe refund failed: ${data.error}`);
		}
	}

	// 2. Giftcard portion
	const giftcardIds = Array.isArray(transaction.giftcards) ? transaction.giftcards : [];
	const giftcardAmount = parseInt(transaction.giftcard_amount) || 0;
	if (giftcardIds.length > 0 && giftcardAmount > 0) {
		try {
			const giftcardId =
				typeof giftcardIds[0] === "object" ? giftcardIds[0].$id : giftcardIds[0];
			const giftcard = await databases.getDocument({
				databaseId: config.databases.bar.id,
				collectionId: config.databases.bar.collections.giftcards,
				documentId: giftcardId,
			});
			await databases.updateDocument({
				databaseId: config.databases.bar.id,
				collectionId: config.databases.bar.collections.giftcards,
				documentId: giftcardId,
				data: { balance: (parseInt(giftcard.balance) || 0) + giftcardAmount },
			});
		} catch (err) {
			throw new Error(
				`${transaction.stripe_id ? "Card refunded, but t" : "T"}he gift card balance failed ` +
					`to update -- please credit it back manually. (${err.message})`,
			);
		}
	}

	// 3. Mark the transaction refunded
	try {
		await databases.updateDocument({
			databaseId: config.databases.bar.id,
			collectionId: config.databases.bar.collections.transactions,
			documentId: transaction.$id,
			data: { status: "refunded" },
		});
	} catch (err) {
		throw new Error(
			`Refund processed, but failed to update the transaction record -- please mark it ` +
				`refunded manually. (${err.message})`,
		);
	}

	return true;
}
