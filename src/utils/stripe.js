import { useAppwrite } from "./api";
import { useState, useEffect, useCallback, useRef } from "react";
import { loadStripeTerminal } from "@stripe/terminal-js";
import { isTestEnvironment } from "./environment";

const test = isTestEnvironment;

export function useStripe() {
	// call appwrite function : 68f2904a00171e8b0266
	const { generateStripeConnectionToken, functions } = useAppwrite();

	const stripeToken = useRef(null);
	const [terminals, setTerminals] = useState([]);

	const [selectedTerminal, setSelectedTerminal] = useState("");
	const [terminalReady, setTerminalReady] = useState(false);

	const chargeID = useRef(null);
	const intentID = useRef(null);
	// The transaction the intent in chargeID/intentID was minted for. Those two refs
	// outlive a single sale (they're only ever overwritten), so without this a "retry"
	// -- or a cancel triggered by an unrelated cash/giftcard failure -- could reach for
	// the PREVIOUS customer's already-succeeded intent. Every reuse is scoped by it.
	const chargeTransactionID = useRef(null);

	const [stripeAlert, setStripeAlert] = useState({
		active: false,
		message: "",
		type: "info",
	});

	const [transactionInProgress, setTransactionInProgress] = useState(false);

	const terminal = useRef(null);
	const initialized = useRef(false);

	const fetchStripeToken = useCallback(async () => {
		try {
			const token = await generateStripeConnectionToken();

			stripeToken.current = token;
			return token;
		} catch (error) {
			console.error("Error fetching Stripe token:", error);
			setStripeAlert({
				active: true,
				message: "Error fetching Stripe token",
				type: "error",
			});
			return error;
		}
	}, [generateStripeConnectionToken]);

	const getTerminals = useCallback(async () => {
		setStripeAlert({
			active: true,
			message: "Connecting to Terminal...",
			type: "info",
			autoExpire: false,
		});
		try {
			let config;
			if (test) {
				config = {
					simulated: false,
					location: "tml_Gp1wVQgFkLNRp0",
				};
			} else {
				config = {
					simulated: false,
					location: "tml_GO9PRw37uKAph5",
				};
			}
			const discoverResult = await terminal.current.discoverReaders(config);
			if (discoverResult.error) {
				setStripeAlert({
					active: true,
					message: "Failed to discover readers",
					type: "error",
				});
			} else if (discoverResult.discoveredReaders.length === 0) {
				setStripeAlert({
					active: true,
					message: "No available readers",
					type: "error",
				});
			} else {
				const onlineReaders = discoverResult.discoveredReaders.filter((reader) => reader.status === "online");

				if (onlineReaders.length === 0) {
					setStripeAlert({
						active: true,
						message: "No online readers available, will retry soon",
						type: "error",
					});
					return;
				}
				setStripeAlert({
					active: true,
					message: "Terminals fetched",
					type: "info",
				});
				setTerminals(onlineReaders);
			}
		} catch (error) {
			console.error("Error fetching terminals:", error);
			setStripeAlert({
				active: true,
				message: "Error fetching terminals",
				type: "error",
			});
		}
	}, [terminal, setStripeAlert, setTerminals]);

	const unexpectedDisconnect = useCallback(
		(err) => {
			console.error("Reader disconnected unexpectedly");
			// Handle the unexpected disconnection
			getTerminals();
		},
		[getTerminals],
	);

	const initializeTerminal = useCallback(async () => {
		// prevent double-initialization
		if (initialized.current) return;
		if (terminal.current) {
			initialized.current = true;
			return;
		}
		setStripeAlert({
			active: true,
			message: "Connecting to Stripe Terminal...",
			type: "info",
			autoExpire: false,
		});

		// Fetch an initial token so we can attempt discovery immediately.
		const token = await fetchStripeToken();

		const StripeTerminal = await loadStripeTerminal();
		terminal.current = StripeTerminal.create({
			onFetchConnectionToken: fetchStripeToken,
			onUnexpectedReaderDisconnect: unexpectedDisconnect,
		});

		// If we obtained a token, try discovering readers now.
		if (token) {
			getTerminals();
		}

		initialized.current = true;
	}, [fetchStripeToken, unexpectedDisconnect, getTerminals]);

	function disconnectReader() {
		if (terminal.current) {
			terminal.current.disconnectReader().then((result) => {
				setStripeAlert({
					active: true,
					message: "Reader disconnected",
					type: "error",
				});
				// allow re-initialization after a manual disconnect
				initialized.current = false;
			});
		}
	}

	/**
	 * Mint a PaymentIntent for one sale via Stripe-CreatePaymentIntent.
	 *
	 * `transactionId` is REQUIRED and is not decoration: CreatePaymentIntent stamps it
	 * into the intent's `metadata.transactionId`, and Transaction-RecordPayment hard-
	 * rejects any stripe leg whose intent carries no/mismatched metadata. An intent
	 * minted without it can still be charged -- the money is captured immediately
	 * (capture_method: 'automatic') -- and can then never be recorded against the sale.
	 * So refuse to mint one at all rather than take money we can't book.
	 *
	 * Throws (carrying the server's own message where there is one) instead of resolving
	 * undefined -- Appwrite's createExecution resolves normally even for a 500, so a
	 * swallowed failure used to be handed to collectPaymentMethod as the client secret.
	 */
	const getChargeID = useCallback(
		async (amountCents, transactionId) => {
			if (!transactionId) {
				const err = new Error("Cannot create a Stripe payment intent without a transaction id");
				console.error(err.message);
				setStripeAlert({ active: true, message: err.message, type: "error" });
				throw err;
			}

			let data;
			try {
				const response = await functions.createExecution({
					functionId: "68f3c860003da00f14d8",
					body: JSON.stringify({
						test: test ? "test" : "",
						amount: parseInt(amountCents),
						transactionId,
					}),
				});
				data = JSON.parse(response.responseBody || "{}");
			} catch (error) {
				console.error("Error generating Stripe intent:", error);
				setStripeAlert({
					active: true,
					message: "Error generating Stripe intent",
					type: "error",
				});
				throw error;
			}

			if (data.error || !data.intent || !data.intent.client_secret) {
				const message = data.error || "Error generating Stripe intent";
				console.error("Error generating Stripe intent:", message);
				setStripeAlert({ active: true, message, type: "error" });
				throw new Error(message);
			}

			// store intent id in a ref to avoid unnecessary re-renders
			intentID.current = data.intent.id;
			return data.intent.client_secret;
		},
		[functions, setStripeAlert],
	);

	/**
	 * Ask Stripe to cancel the intent currently held in the refs.
	 *
	 * `transactionId` scopes it: the refs survive past the sale they were minted for, so
	 * a failure on some LATER transaction (a cash leg, a giftcard leg) must not cancel
	 * the previous customer's intent. Pass the current transaction's id; a mismatch is a
	 * no-op.
	 */
	const handleCancelStripePayment = useCallback(
		async (transactionId = null) => {
			if (!chargeID.current) return;
			if (transactionId && chargeTransactionID.current && chargeTransactionID.current !== transactionId) {
				return;
			}
			try {
				await functions.createExecution({
					functionId: "68f6272500160b48ee44",
					body: JSON.stringify({
						test: test ? "test" : "",
						intent: intentID.current,
						// Name the sale this intent belongs to. Stripe-CancelPaymentIntent
						// compares it against the intent's own metadata stamp and refuses a
						// mismatch, which stops one till cancelling another till's in-flight
						// charge. chargeTransactionID is the id the intent was actually minted
						// for, so it is the honest answer even when the caller passed nothing.
						transactionId: transactionId || chargeTransactionID.current || undefined,
					}),
				});
				// Cancelled -- drop the refs so nothing downstream can reuse this intent.
				chargeID.current = null;
				intentID.current = null;
				chargeTransactionID.current = null;
				setStripeAlert({
					active: true,
					message: "Stripe payment cancelled",
					type: "success",
				});
			} catch (error) {
				console.error("Error cancelling Stripe payment:", error);
				setStripeAlert({
					active: true,
					message: "Error cancelling Stripe payment",
					type: "error",
				});
			}
		},
		[functions, setStripeAlert],
	);

	const stopTransactionInProgress = useCallback(() => {
		if (terminal.current) terminal.current.cancelCollectPaymentMethod();

		setTransactionInProgress(false);
	}, []);

	/**
	 * Charge the reader for `amountCents` against transaction `transactionId`.
	 *
	 * A plain async function (not `new Promise(async …)`) -- the old wrapper swallowed any
	 * thrown exception into the executor's own invisible promise and left the returned one
	 * permanently pending, which locked the till behind the ProcessingModal.
	 *
	 * `update_payment_intent: true` lets the reader rewrite the intent's amount to add an
	 * on-reader tip, so the PaymentIntent this resolves with is base + tip. The payment
	 * leg recorded for it stays TIP-EXCLUSIVE (the tip is carried separately, on
	 * Transactions.tip) -- see handleCardPayment.js.
	 */
	async function chargeCard(amountCents, retrying = false, transactionId = null) {
		if (amountCents <= 50) {
			throw new Error("Amount must be greater than 50 cents");
		}
		if (!terminal.current) {
			throw new Error("Stripe terminal not connected");
		}

		let localChargeID;
		// Only reuse the existing intent when retrying the SAME sale. Reusing one minted
		// for a different transaction would collect against the previous customer's
		// intent, and RecordPayment would refuse the leg anyway (metadata mismatch).
		if (retrying && chargeID.current && (!transactionId || chargeTransactionID.current === transactionId)) {
			localChargeID = chargeID.current;
		} else {
			localChargeID = await getChargeID(amountCents, transactionId);
			chargeID.current = localChargeID;
			chargeTransactionID.current = transactionId;
		}

		if (!localChargeID) {
			throw new Error("Failed to create a Stripe payment intent");
		}

		const collectResult = await terminal.current.collectPaymentMethod(localChargeID, {
			config_override: {
				enable_customer_cancellation: true,
				update_payment_intent: true,
			},
		});

		if (collectResult.error) {
			console.error("Error collecting payment method:", collectResult.error);
			throw collectResult.error;
		}

		const processResult = await terminal.current.processPayment(collectResult.paymentIntent);

		if (processResult.error) {
			console.error("Error processing payment:", processResult.error);
			throw processResult.error;
		}

		const finalPaymentIntent = processResult.paymentIntent;

		if (finalPaymentIntent.status === "requires_capture" || finalPaymentIntent.status === "succeeded") {
			return finalPaymentIntent;
		}

		console.error("Payment Intent ended in an unexpected status:", finalPaymentIntent.status);
		throw new Error(`Unexpected PI status: ${finalPaymentIntent.status}`);
	}

	useEffect(() => {
		initializeTerminal();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		async function connectToReader() {
			const connectResult = await terminal.current.connectReader(selectedTerminal);
			if (connectResult.error) {
				console.error("Failed to connect to reader:", connectResult.error);
				setStripeAlert({
					active: true,
					message: "Failed to connect to reader",
					type: "error",
				});
				initializeTerminal();
			} else {
				setStripeAlert({
					active: true,
					message: `Connected to reader: ${connectResult.reader.label}`,
					type: "success",
				});
				setTerminalReady(true);
			}
		}
		if (selectedTerminal) {
			connectToReader();
		}
	}, [selectedTerminal, initializeTerminal]);

	useEffect(() => {
		if (!stripeAlert.active) return;
		if (stripeAlert.autoExpire === false) return;

		const timer = setTimeout(() => {
			const { message, type } = stripeAlert;
			setStripeAlert({ active: false, message, type });
		}, 5000);

		// clear previous timer if alert changes (reset countdown)
		return () => clearTimeout(timer);
	}, [stripeAlert]);

	return {
		stripeToken,
		terminals,
		getTerminals,
		selectedTerminal,
		setSelectedTerminal,
		disconnectReader,
		chargeCard,
		terminalReady,
		setTerminalReady,
		terminal: terminal.current,
		stripeAlert,
		setStripeAlert,
		transactionInProgress,
		setTransactionInProgress,
		initializeTerminal,
		handleCancelStripePayment,
		stopTransactionInProgress,
	};
}
