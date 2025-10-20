/* eslint-disable no-unused-vars */
/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useEffect } from "react";
import { Box, Button, Modal } from "@mui/joy";
import Cart from "./cart";
import Modals from "./modals";
import {
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Alert,
    Collapse,
} from "@mui/material";
import { useAppwrite } from "../../utils/api";
import Item from "./item";
import Category from "./category";
import { formatCAD } from "../../utils/format";
import { useStripe } from "../../utils/stripe";
import { type } from "@testing-library/user-event/dist/type";

const POS = () => {
    const {
        client,
        databases,
        account,
        config,
        categories,
        items,
        refreshCategories,
        refreshItems,
        refreshData,
        settings,
        uniqueId,
    } = useAppwrite();

    const {
        stripeToken,
        terminals,
        selectedTerminal,
        setSelectedTerminal,
        chargeCard,
        terminalReady,
        terminal,
        stripeAlert,
        setStripeAlert,
        transactionInProgress,
        setTransactionInProgress,
    } = useStripe();

    const member_discount = settings ? settings.member_discount : 0;

    // formatCAD is imported from shared utils

    const [cart, setCart] = useState([]);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [checkoutSuccess, setCheckoutSuccess] = useState(false);
    const [checkoutError, setCheckoutError] = useState("");
    const [paymentMethod, setPaymentMethod] = useState("stripe");
    const [amountReceived, setAmountReceived] = useState(0);
    const [changeDue, setChangeDue] = useState(0);
    const [discount, setDiscount] = useState(0);
    const [total, setTotal] = useState(0);
    const [member_discount_applied, setMemberDiscountApplied] = useState(false);
    const [checkoutLoading, setCheckoutLoading] = useState(false);
    const [transactionId, setTransactionId] = useState(null);
    const [cashModalOpen, setCashModalOpen] = useState(false);

    const calculateTotal = () => {
        let newTotal = cart.reduce(
            (acc, item) => acc + item.price * item.quantity,
            0
        );
        if (member_discount_applied) {
            const discountAmount = (newTotal * member_discount) / 100;
            setDiscount(discountAmount);
            newTotal -= discountAmount;
        } else {
            setDiscount(0);
        }
        setTotal(newTotal);
    };

    const applyMemberDiscount = () => {
        if (member_discount_applied) {
            setMemberDiscountApplied(false);
            setDiscount(0);
        } else {
            setMemberDiscountApplied(true);
        }
    };

    function addItemToCart(item) {
        const existingItem = cart.find((cartItem) => cartItem.$id === item.$id);
        if (existingItem) {
            setCart(
                cart.map((cartItem) =>
                    cartItem.$id === item.$id
                        ? { ...cartItem, quantity: cartItem.quantity + 1 }
                        : cartItem
                )
            );
        } else {
            setCart([...cart, { ...item, quantity: 1 }]);
        }
    }

    function removeItemFromCart(itemId) {
        const existingItem = cart.find((cartItem) => cartItem.$id === itemId);
        if (existingItem.quantity > 1) {
            setCart(
                cart.map((cartItem) =>
                    cartItem.$id === itemId
                        ? { ...cartItem, quantity: cartItem.quantity - 1 }
                        : cartItem
                )
            );
        } else {
            setCart(cart.filter((cartItem) => cartItem.$id !== itemId));
        }
    }

    function clearCart() {
        setMemberDiscountApplied(false);
        setDiscount(0);
        setCart([]);
    }

    async function checkout() {
        setTransactionInProgress(true);
        if (!paymentMethod) {
            setCheckoutError("Please select a payment method");
            return;
        }

        const transaction = {
            items: JSON.stringify(cart),
            payment_due: parseInt(total),
            payment_method: paymentMethod,
            tip: 0,
            event: null,
            discount: parseInt(discount),
            discount_reason: member_discount_applied ? "member_discount" : "",
            status: "pending",
            testing: true,
        };

        const document = await databases.createDocument(
            config.databases.bar.id,
            config.databases.bar.collections.transactions,
            uniqueId(),
            transaction
        );

        setTransactionId(document.$id);

        if (paymentMethod === "cash") {
            setCashModalOpen(true);
            return;
        }
        if (paymentMethod === "stripe") {
            handleCardPayment(document.$id);
        }
    }

    function handleCashPayment() {
        setTransactionInProgress(false);
        setCashModalOpen(false);
        // calculate change due
        const amountReceivedCents = Math.round(amountReceived * 100);
        if (amountReceivedCents < total) {
            setCheckoutError("Amount received is less than total");
            return;
        }
        const change = amountReceivedCents - total;
        setChangeDue(change);
        setCheckoutError("");
        setCheckoutSuccess(true);
        clearCart();
        setPaymentMethod(null);
        setAmountReceived(0);
        databases.updateDocument({
            databaseId: config.databases.bar.id,
            collectionId: config.databases.bar.collections.transactions,
            documentId: transactionId,
            data: {
                status: "complete",
            },
        });
    }

    function handleCardPayment(transaction) {
        if (!stripeToken) {
            console.error("Stripe token is not available");
            return;
        }
        // process card payment with stripe
        chargeCard(total)
            .then((result) => {
                console.log("Charge successful:", result);

                databases.updateDocument({
                    databaseId: config.databases.bar.id,
                    collectionId: config.databases.bar.collections.transactions,
                    documentId: transaction,
                    data: {
                        status: "complete",
                        tip: parseInt(result.amount_details.tip.amount),
                        stripe_id: result.id,
                    },
                });
                setTransactionInProgress(false);
                setCheckoutSuccess(true);
                clearCart();
                setPaymentMethod(null);
            })
            .catch((error) => {
                console.error("Error processing card payment:", error);
                setTransactionInProgress(false);
                setCheckoutError("Error processing card payment");
            });
    }

    useEffect(() => {
        calculateTotal();
        if (terminal && terminalReady) {
            if (cart.length === 0) terminal.clearReaderDisplay();
            else {
                console.log("Updating terminal display with cart items");
                terminal.setReaderDisplay({
                    cart: {
                        line_items: [
                            ...cart.map((item) => ({
                                description: item.name,
                                quantity: item.quantity,
                                amount: parseInt(item.price) * item.quantity,
                            })),
                            ...(member_discount_applied
                                ? [
                                    {
                                        description: "Member Discount",
                                        quantity: 1,
                                        amount: -1 * parseInt(discount),
                                    },
                                ]
                                : []),
                        ],
                        total: parseInt(total),
                        currency: "cad",
                    },
                    type: "cart",
                });
            }
        }
    }, [cart, discount, calculateTotal, terminal, terminalReady, total]);

    useEffect(() => {
        refreshCategories();
        refreshItems();
        refreshData();
    }, [
        categories.length,
        items.length,
        refreshCategories,
        refreshItems,
        refreshData,
    ]);

    return (
        <Box sx={{ display: "flex", height: "100vh" }}>
            <Box
                sx={{
                    flex: 1,
                    gap: 10,
                    overflow: "wrap",
                    display: "flex",
                    flexWrap: "wrap",
                    p: 2,
                    height: "95%",
                    overflowY: "auto",
                    alignContent: "flex-start",
                    alignItems: "flex-start",
                }}
            >

                {categories.map((category) => (
                    <Category
                        key={category.$id}
                        category={category}
                        items={items}
                        onAdd={addItemToCart}
                    />
                ))}
            </Box>

            <Box
                sx={{
                    width: "2px",
                    height: "100%",
                    alignSelf: "center",
                    backgroundColor: "divider",
                    mx: "1px",
                }}
            />

            <Cart
                cart={cart}
                formatCAD={formatCAD}
                member_discount_applied={member_discount_applied}
                applyMemberDiscount={applyMemberDiscount}
                clearCart={clearCart}
                removeItemFromCart={removeItemFromCart}
                total={total}
                terminalReady={terminalReady}
                paymentMethod={paymentMethod}
                setPaymentMethod={setPaymentMethod}
                checkout={checkout}
                checkoutError={checkoutError}
                setCheckoutError={setCheckoutError}
                cashModalOpen={cashModalOpen}
                setCashModalOpen={setCashModalOpen}
                amountReceived={amountReceived}
                setAmountReceived={setAmountReceived}
                handleCashPayment={handleCashPayment}
                checkoutSuccess={checkoutSuccess}
                setCheckoutSuccess={setCheckoutSuccess}
                changeDue={changeDue}
                setChangeDue={setChangeDue}
                transactionInProgress={transactionInProgress}
                terminals={terminals}
                selectedTerminal={selectedTerminal}
                setSelectedTerminal={setSelectedTerminal}
            />
            <Modals
                cashModalOpen={cashModalOpen}
                setCashModalOpen={setCashModalOpen}
                checkoutSuccess={checkoutSuccess}
                setCheckoutSuccess={setCheckoutSuccess}
                checkoutError={checkoutError}
                setCheckoutError={setCheckoutError}
                transactionInProgress={transactionInProgress}
                amountReceived={amountReceived}
                setAmountReceived={setAmountReceived}
                handleCashPayment={handleCashPayment}
                changeDue={changeDue}
                formatCAD={formatCAD}
            />
            <Collapse id="primaryAlert" in={stripeAlert.active}>
                <Alert
                    variant="filled"
                    open={stripeAlert.active}
                    onClose={() =>
                        setStripeAlert({
                            active: false,
                            message: "",
                            type: "info",
                        })
                    }
                    severity={stripeAlert.type}
                >
                    {stripeAlert.message}
                </Alert>
            </Collapse>
        </Box>
    );
};

export default POS;

