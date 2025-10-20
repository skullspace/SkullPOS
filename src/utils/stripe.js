import { useAppwrite } from "./api";
import { useState, useEffect, useCallback, useRef } from "react";
import { loadStripeTerminal } from "@stripe/terminal-js";

export function useStripe() {
	// call appwrite function : 68f2904a00171e8b0266
	const { generateStripeConnectionToken, functions } = useAppwrite();

	const [stripeToken, setStripeToken] = useState(null);
	const [terminals, setTerminals] = useState([]);

	const [refreshingTerminals, setRefreshingTerminals] = useState(false);

	const [selectedTerminal, setSelectedTerminal] = useState("");
	const [terminalReady, setTerminalReady] = useState(false);

	const [chargeID, setChargeID] = useState(null);
	const [intentID, setIntentID] = useState(null);

	const [stripeAlert, setStripeAlert] = useState({
		active: false,
		message: "",
		type: "info",
	});

	const [transactionInProgress, setTransactionInProgress] = useState(false);

	const terminal = useRef(null);

	const fetchStripeToken = useCallback(async () => {
		try {
			const token = await generateStripeConnectionToken();

			setStripeToken(token);
			return token;
		} catch (error) {
			console.error("Error fetching Stripe token:", error);
			setStripeAlert({
				active: true,
				message: "Error fetching Stripe token",
				type: "error",
			});
			return null;
		}
	}, [generateStripeConnectionToken]);

	const getTerminals = useCallback(async () => {
		setStripeAlert({
			active: true,
			message: "Connecting to Stripe Terminal...",
			type: "info",
			autoExpire: false,
		});
		try {
			const config = {
				simulated: false,
				location: "tml_GO9HoQxw7phAmY",
			};
			const discoverResult = await terminal.current.discoverReaders(
				config
			);
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
				const onlineReaders = discoverResult.discoveredReaders.filter(
					(reader) => reader.status === "online"
				);

				if (onlineReaders.length === 0) {
					setRefreshingTerminals(true);
					setStripeAlert({
						active: true,
						message: "No online readers available, will retry soon",
						type: "error",
					});
					return;
				}
				setTerminals(onlineReaders);
				if (onlineReaders.length === 1) {
					setSelectedTerminal(onlineReaders[0]);
				}
			}
		} catch (error) {
			console.error("Error fetching terminals:", error);
			setStripeAlert({
				active: true,
				message: "Error fetching terminals",
				type: "error",
			});
		}
	}, [
		terminal,
		setStripeAlert,
		setRefreshingTerminals,
		setTerminals,
		setSelectedTerminal,
	]);

	const unexpectedDisconnect = useCallback(() => {
		console.error("Reader disconnected unexpectedly");
		// Handle the unexpected disconnection
		getTerminals();
	}, [getTerminals]);

	const initializeTerminal = useCallback(async () => {
		setRefreshingTerminals(false);
		setStripeAlert({
			active: true,
			message: "Connecting to Stripe Terminal...",
			type: "info",
			autoExpire: false,
		});
		fetchStripeToken();

		const StripeTerminal = await loadStripeTerminal();
		terminal.current = StripeTerminal.create({
			onFetchConnectionToken: fetchStripeToken,
			onUnexpectedReaderDisconnect: unexpectedDisconnect,
		});
	}, [fetchStripeToken, unexpectedDisconnect]);

	function disconnectReader() {
		if (terminal.current) {
			terminal.current.disconnectReader().then((result) => {
				setRefreshingTerminals(true);
				setStripeAlert({
					active: true,
					message: "Reader disconnected",
					type: "error",
				});
			});
		}
	}

	const getChargeID = useCallback(
		async (amountCents) => {
			try {
				const response = await functions.createExecution({
					functionId: "68f3c860003da00f14d8",
					body: JSON.stringify({ amount: parseInt(amountCents) }),
				});
				const data = JSON.parse(response.responseBody);
				console.log("Generated Charge ID:", data);

				setIntentID(data.intent.id);
				console.log("Generated Intent ID:", data.intent.id);
				return data.intent.client_secret;
			} catch (error) {
				console.error("Error generating Stripe intent:", error);

				setStripeAlert({
					active: true,
					message: "Error generating Stripe intent",
					type: "error",
				});
			}
		},
		[functions]
	);

	useEffect(() => {
		console.log("Current Charge ID:", stripeToken);
	}, [stripeToken]);

	const handleCancelStripePayment = useCallback(async () => {
		if (!chargeID) return;
		try {
			await functions.createExecution({
				functionId: "68f6272500160b48ee44",
				body: JSON.stringify({ intent: intentID }),
			});
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
	}, [chargeID, functions, intentID]);

	const stopTransactionInProgress = useCallback(() => {
		terminal.current.cancelCollectPaymentMethod();

		setTransactionInProgress(false);
	}, []);

	function chargeCard(amountCents, retrying = false) {
		return new Promise(async (resolve, reject) => {
			let localChargeID;
			if (!retrying) {
				localChargeID = await getChargeID(amountCents);
				setChargeID(localChargeID);
			} else {
				localChargeID = chargeID;
			}
			console.log("Charge ID:", localChargeID);
			const collectResult = await terminal.current.collectPaymentMethod(
				localChargeID,
				{
					config_override: {
						enable_customer_cancellation: true,
						update_payment_intent: true,
					},
				}
			);

			if (collectResult.error) {
				console.error(
					"Error collecting payment method:",
					collectResult.error
				);
				reject(collectResult.error);
				return;
			}
			const processResult = await terminal.current.processPayment(
				collectResult.paymentIntent
			);

			if (processResult.error) {
				console.error("Error processing payment:", processResult.error);
				reject(processResult.error);
				return;
			}

			const finalPaymentIntent = processResult.paymentIntent;

			if (finalPaymentIntent.status === "requires_capture") {
				resolve(finalPaymentIntent);
			} else if (finalPaymentIntent.status === "succeeded") {
				resolve(finalPaymentIntent);
			} else {
				console.error(
					"Payment Intent ended in an unexpected status:",
					finalPaymentIntent.status
				);
				reject(
					new Error(
						`Unexpected PI status: ${finalPaymentIntent.status}`
					)
				);
			}
		});
	}

	useEffect(() => {
		initializeTerminal();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		if (stripeToken) {
			getTerminals();
		}
	}, [getTerminals, stripeToken]);

	useEffect(() => {
		async function connectToReader() {
			const connectResult = await terminal.current.connectReader(
				selectedTerminal
			);
			if (connectResult.error) {
				console.error(
					"Failed to connect to reader:",
					connectResult.error
				);
				setStripeAlert({
					active: true,
					message: "Failed to connect to reader",
					type: "error",
				});
				setRefreshingTerminals(true);
			} else {
				setRefreshingTerminals(false);
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
	}, [selectedTerminal]);

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

	// retry fetching terminals every minute if none are available
	useEffect(() => {
		const interval = setInterval(() => {
			if (!terminals || terminals.length === 0) {
				getTerminals();
			}
		}, 30000);

		return () => clearInterval(interval);
	}, [terminals, refreshingTerminals, getTerminals]);

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
