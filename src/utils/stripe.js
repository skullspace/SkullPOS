import { Appwrite } from "appwrite";
import { useAppwrite } from "./api";
import { useMemo, useState, useEffect, useCallback, useRef, use } from "react";
import { loadStripeTerminal } from "@stripe/terminal-js";

export function useStripe() {
    // call appwrite function : 68f2904a00171e8b0266
    const { generateStripeConnectionToken, functions } = useAppwrite();

    const [stripeToken, setStripeToken] = useState(null);
    const [terminals, setTerminals] = useState([]);

    const [selectedTerminal, setSelectedTerminal] = useState("");
    const [terminalReady, setTerminalReady] = useState(false);

    const [stripeAlert, setStripeAlert] = useState({ active: false, message: "", type: "info" });

    const [transactionInProgress, setTransactionInProgress] = useState(false);

    const terminal = useRef(null);

    async function fetchStripeToken() {
        try {
            console.log("Fetching Stripe token...");
            const token = await generateStripeConnectionToken();
            setStripeToken(token);
            return token;
        } catch (error) {
            console.error("Error fetching Stripe token:", error);
            setStripeAlert({ active: true, message: "Error fetching Stripe token", type: "error" });
            return null;
        }
    }

    async function getTerminals() {
        try {
            const config = {
                simulated: false,
                location: "tml_GO9HoQxw7phAmY",
            };
            const discoverResult = await terminal.current.discoverReaders(
                config
            );
            console.log("Discovered readers:", discoverResult.discoveredReaders);
            if (discoverResult.error) {
                console.log("Failed to discover: ", discoverResult.error);
                setStripeAlert({ active: true, message: "Failed to discover readers", type: "error" });
            } else if (discoverResult.discoveredReaders.length === 0) {
                console.log("No available readers.");
                setStripeAlert({ active: true, message: "No available readers", type: "error" });
            } else {
                const onlineReaders = discoverResult.discoveredReaders.filter(
                    (reader) => reader.status === "online"
                );
                setTerminals(onlineReaders);
                if (onlineReaders.length === 1) {
                    setSelectedTerminal(onlineReaders[0]);
                }
            }
        } catch (error) {
            console.error("Error fetching terminals:", error);
            setStripeAlert({ active: true, message: "Error fetching terminals", type: "error" });
        }
    }

    function unexpectedDisconnect() {
        console.log("Reader disconnected unexpectedly");
        // Handle the unexpected disconnection
        fetchStripeToken();
        getTerminals();
    }

    async function initializeTerminal() {
        fetchStripeToken()
        const StripeTerminal = await loadStripeTerminal();
        terminal.current = StripeTerminal.create({
            onFetchConnectionToken: fetchStripeToken,
            onUnexpectedReaderDisconnect: unexpectedDisconnect,
        });
    }

    function disconnectReader() {
        if (terminal.current) {
            terminal.current.disconnectReader().then((result) => {
                setStripeAlert({ active: true, message: "Reader disconnected", type: "error" });
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
                console.log(response.responseBody);
                const data = JSON.parse(response.responseBody);
                return data.secret;
            } catch (error) {
                console.error("Error generating Stripe intent:", error);

                setStripeAlert({ active: true, message: "Error generating Stripe intent", type: "error" });
            }
        },
        [functions]
    );

    function chargeCard(amountCents) {
        return new Promise(async (resolve, reject) => {
            const chargeID = await getChargeID(amountCents);
            const collectResult = await terminal.current.collectPaymentMethod(
                chargeID,
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
    }, []);



    useEffect(() => {
        if (stripeToken) {
            getTerminals();
        }
    }, [stripeToken]);

    useEffect(() => {
        async function connectToReader() {
            const connectResult = await terminal.current.connectReader(
                selectedTerminal
            );
            if (connectResult.error) {
                console.log("Failed to connect:", connectResult.error);
                setStripeAlert({ active: true, message: "Failed to connect to reader", type: "error" });
            } else {
                console.log("Connected to reader:", connectResult.reader.label);
                setStripeAlert({ active: true, message: `Connected to reader: ${connectResult.reader.label}`, type: "success" });
                setTerminalReady(true);
            }
        }
        if (selectedTerminal) {
            connectToReader();
        }
    }, [selectedTerminal]);

    useEffect(() => {
        console.log("Stripe Alert:", stripeAlert);
        if (stripeAlert.active) {
            setTimeout(() => {
                const { message, type } = stripeAlert;
                setStripeAlert({ active: false, message, type });
            }, 5000);
        }
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
        initializeTerminal
    };
}
