import { Appwrite } from 'appwrite';
import { useAppwrite } from './api';
import { useMemo, useState, useEffect, useCallback, useRef, use } from 'react';
import { loadStripeTerminal } from '@stripe/terminal-js';


export function useStripe() {
    // call appwrite function : 68f2904a00171e8b0266
    const { generateStripeConnectionToken } = useAppwrite();

    const [stripeToken, setStripeToken] = useState(null);
    const [terminals, setTerminals] = useState([]);

    const [selectedTerminal, setSelectedTerminal] = useState(null);

    const terminal = useRef(null);


    async function fetchStripeToken() {
        try {
            const token = await generateStripeConnectionToken();
            console.log("Stripe Token:", token);
            setStripeToken(token);
            return token;
        } catch (error) {
            console.error('Error fetching Stripe token:', error);
            return null;
        }
    }

    function refreshStripeToken() {
        return fetchStripeToken();
    }






    async function getTerminals() {

        try {
            const config = {
                simulated: false, location: "tml_GO9HoQxw7phAmY"
            }
            const discoverResult = await terminal.current.discoverReaders(config);
            if (discoverResult.error) {
                console.log('Failed to discover: ', discoverResult.error);
            } else if (discoverResult.discoveredReaders.length === 0) {
                console.log('No available readers.');
            } else {
                console.log('Discovered readers: ', discoverResult.discoveredReaders);
                setTerminals(discoverResult.discoveredReaders);
            }

        } catch (error) {
            console.error('Error fetching terminals:', error);
        }
    }


    function unexpectedDisconnect() {
        console.log("Reader disconnected unexpectedly");
        // Handle the unexpected disconnection
        fetchStripeToken();
        getTerminals();
    }


    async function initializeTerminal() {
        const StripeTerminal = await loadStripeTerminal();
        console.log(await fetchStripeToken())
        terminal.current = StripeTerminal.create({
            onFetchConnectionToken: fetchStripeToken,
            onUnexpectedReaderDisconnect: unexpectedDisconnect,
        });
    };

    useEffect(() => {
        fetchStripeToken();

        initializeTerminal();
    }, []);

    useEffect(() => {
        if (stripeToken) {
            getTerminals();
        }

    }, [stripeToken]);

    useEffect(() => {
        async function connectToReader() {
            console.log("Selected Terminal:", selectedTerminal);

            const connectResult = await terminal.current.connectReader(selectedTerminal);
            if (connectResult.error) {
                console.log('Failed to connect:', connectResult.error);
            } else {
                console.log('Connected to reader:', connectResult.reader.label);
            }
        }
        if (selectedTerminal) {
            connectToReader();
        }
    }, [selectedTerminal]);

    function disconnectReader() {
        if (terminal.current) {
            terminal.current.disconnectReader().then((result) => {
                console.log("Disconnected from reader:", result);
            });
        }
    }

    function chargeCard(amountCents) {
        return new Promise(async (resolve, reject) => {
            try {
                const result = await terminal.current.processPayment({
                    amount: amountCents,
                    currency: 'cad',
                });
                resolve(result);
            } catch (error) {
                console.error('Error charging card:', error);
                reject(error);
            }
        });
    }

    return {
        stripeToken,
        terminals,
        getTerminals,
        selectedTerminal,
        setSelectedTerminal,
        disconnectReader,
        chargeCard
    };
}


