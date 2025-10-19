/* eslint-disable no-unused-vars */
/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useEffect } from "react";
import { Box, Button, Modal } from "@mui/joy";
import { FormControl, InputLabel, Select, MenuItem } from "@mui/material";
import { useAppwrite } from "../../api";
import { useStripe } from "../../stripe";

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
        uniqueId
    } = useAppwrite();

    const {
        stripeToken,
        terminals,
        getTerminals,
        selectedTerminal,
        setSelectedTerminal,
        disconnectReader,
        chargeCard
    } = useStripe();


    const member_discount = settings ? settings.member_discount : 0;

    // Helper to format price stored in cents to CAD currency
    const formatCAD = (cents) => {
        return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(cents / 100);
    };

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
        let newTotal = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);
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
        if (!paymentMethod) {
            setCheckoutError("Please select a payment method");
            return;
        }
        /*
    Transactions
    stripe_id
    items
    cost
    status
    tip
    event
    discount
    discount_reason
    payment_method
    */
        // create transaction in appwrite
        const transaction = {
            items: JSON.stringify(cart),
            payment_due: total,
            payment_method: paymentMethod,
            tip: 0,
            event: null,
            discount,
            discount_reason: member_discount_applied ? "member_discount" : "",
            status: "pending",
            testing: true
        };

        const document = await databases.createDocument(
            config.databases.bar.id,
            config.databases.bar.collections.transactions,
            uniqueId(),
            transaction
        );

        console.log("Transaction created:", document.$id);
        setTransactionId(document.$id);
        console.log("Current Transaction ID:", transactionId);

        if (paymentMethod === "cash") {
            setCashModalOpen(true);
            return;
        }
        if (paymentMethod === "stripe") {
            console.log(transactionId)
            console.log("handling card payment");
            handleCardPayment(document.$id);
        }


    }

    function handleCashPayment() {
        setCashModalOpen(false)
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
        console.log(transactionId)
        databases.updateDocument({
            databaseId: config.databases.bar.id,
            collectionId: config.databases.bar.collections.transactions,
            documentId: transactionId,
            data: {
                status: "complete",
            }
        });
    }

    function handleCardPayment(transaction) {
        if (!stripeToken) {
            console.error('Stripe token is not available');
            return;
        }
        // process card payment with stripe
        console.log("processing card payment with stripe token", stripeToken);
        console.log(total)
        chargeCard(total).then((result) => {
            console.log("Charge successful:", result.amount_details.tip.amount);
            console.log(transaction);

            databases.updateDocument({
                databaseId: config.databases.bar.id,
                collectionId: config.databases.bar.collections.transactions,
                documentId: transaction,
                data: {
                    status: "complete",
                    tip: parseInt(result.amount_details.tip.amount)
                }
            });
            setCheckoutSuccess(true);
            clearCart();
            setPaymentMethod(null);

        }).catch((error) => {
            console.error('Error processing card payment:', error);

            setCheckoutError("Error processing card payment");
        });
    }

    useEffect(() => {
        calculateTotal();
    }, [cart, discount, calculateTotal]);

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
        <Box sx={{ display: "flex", height: "100vh", }}>
            <Box sx={{
                flex: 1,
                gap: 10,
                overflow: "wrap",
                display: "flex",
                flexWrap: "wrap",
                p: 2,
                height: "95%",
                overflowY: "auto",
                alignContent: "flex-start",
                alignItems: "flex-start"
            }}>

                {/* dropdown to select terminal */}
                <FormControl fullWidth>
                    <InputLabel id="terminal-select-label">Select Terminal</InputLabel>
                    <Select
                        labelId="terminal-select-label"
                        value={selectedTerminal}
                        onChange={(e) => setSelectedTerminal(e.target.value)}
                    >
                        {terminals.map((terminal) => (
                            <MenuItem key={terminal.id} value={terminal}>
                                {terminal.label}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>

                {categories.map((category) => (
                    <Box key={category.$id} sx={{ mb: 4 }}>
                        <h2>{category.name}</h2>
                        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
                            {items
                                .filter(
                                    (item) =>
                                        item.categories.$id === category.$id
                                )
                                .map((item) => (
                                    <Button
                                        key={item.$id}
                                        sx={{ height: "15vh", aspectRatio: "1", border: "1px solid", p: 2 }}
                                        onClick={() => addItemToCart(item)}
                                    >
                                        <h3>{item.name}</h3>
                                        <p>{formatCAD(item.price)}</p>
                                    </Button>
                                ))}
                        </Box>
                    </Box>
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

            <Box
                sx={{
                    width: "20vw",
                    minWidth: 240,
                    maxWidth: "30%",
                    p: 2,
                    display: 'flex',
                    flexDirection: 'column',
                    height: '95%'
                }}
            >
                <Box sx={{ flex: 1, overflow: 'auto' }}>
                    {//sticky header showing if the member discount is applied
                        member_discount_applied && (
                            <Box sx={{ position: 'sticky', top: 0, background: 'background.surface', zIndex: 1, mb: 0, p: 0, borderBottom: '1px solid' }}>
                                <p>Member discount applied</p>
                            </Box>
                        )
                    }
                    {cart.length === 0 ? (
                        <p>The cart is empty</p>
                    ) : (
                        <Box>
                            {cart.map((cartItem) => (
                                <Box
                                    key={cartItem.$id}
                                    sx={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "center",
                                        borderBottom: "1px solid",
                                        py: 1,
                                    }}
                                >
                                    <Box>
                                        <h3>{cartItem.name}</h3>
                                        <p>{formatCAD(cartItem.price)}</p>
                                        <p>Qty: {cartItem.quantity}</p>
                                    </Box>
                                    <Box>
                                        <Button onClick={() => removeItemFromCart(cartItem.$id)}>
                                            Remove
                                        </Button>
                                    </Box>
                                </Box>
                            ))}
                        </Box>
                    )}
                </Box>

                {/* Sticky button grid at bottom */}
                <Box sx={{ position: 'sticky', bottom: 0, mt: 0, background: 'background.surface', p: 0 }}>
                    {cart.length > 0 && (
                        <Box sx={{ mt: 2 }}>
                            {(() => {

                                return <h3>Subtotal: {formatCAD(total)}</h3>;
                            })()}
                        </Box>
                    )}
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5 }}>
                        <Button variant={member_discount_applied ? 'solid' : 'outlined'} onClick={applyMemberDiscount}>
                            Apply Skull Discount
                        </Button>
                        <Button variant="outlined" onClick={clearCart}>
                            Clear Cart
                        </Button>
                        <Button
                            variant={paymentMethod === 'stripe' ? 'solid' : 'outlined'}
                            onClick={() => setPaymentMethod('stripe')}
                        >
                            Card
                        </Button>
                        <Button
                            variant={paymentMethod === 'cash' ? 'solid' : 'outlined'}
                            onClick={() => setPaymentMethod('cash')}
                        >
                            Cash
                        </Button>
                    </Box>
                    <Button
                        color="primary"
                        variant="solid"
                        fullWidth
                        sx={{ mt: 2 }}
                        onClick={checkout}
                        disabled={cart.length === 0}
                    >
                        Checkout
                    </Button>
                </Box>

            </Box>
            {/* Modals for cash payment  */}
            <Modal open={cashModalOpen} onClose={() => setCashModalOpen(false)}>
                <Box sx={{ p: 2 }}>
                    {/* show error if amount received is less than total */}
                    {checkoutError && <p style={{ color: 'red' }}>{checkoutError}</p>}
                    <h3>Cash Payment</h3>
                    <p>Enter Amount Received:</p>
                    <input
                        type="number"
                        value={amountReceived}
                        onChange={(e) => setAmountReceived(e.target.value)}
                    />
                    <Button onClick={handleCashPayment}>Submit</Button>
                </Box>
            </Modal>
            <Modal open={checkoutSuccess} onClose={() => { setCheckoutSuccess(false); setChangeDue(0); setAmountReceived(0); }}>
                <Box sx={{ p: 2 }}>
                    {changeDue > 0 && <p>Change Due: {formatCAD(changeDue)}</p>}
                    <h3>Checkout Successful</h3>
                </Box>
            </Modal>
            {/* Modals for failed transactions */}
            <Modal open={checkoutError} onClose={() => setCheckoutError(false)}>
                <Box sx={{ p: 2 }}>
                    <h3>Checkout Failed</h3>
                    <p>{checkoutError}</p>
                </Box>
            </Modal>
        </Box>
    );
};

export default POS;

// debit/credit brings up a modal for pending transaction for stripe to handle
// cash brings up a modal to enter amount received and calculates change due
