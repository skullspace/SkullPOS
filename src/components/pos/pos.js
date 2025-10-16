/* eslint-disable no-unused-vars */
/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useEffect } from "react";
import { Box, Button } from "@mui/joy";
import { useAppwrite } from "../../api";

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
    } = useAppwrite();

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
        console.log("adding item to cart", item);
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
        setCart([]);
    }

    function checkout() {
        // create transaction in appwrite
        // process payment with stripe using useStripe hook
        // if cash, calculate change due
        // on success clear cart and show success message with transaction details such as tip and change due if cash
        // on failure show error message
    }

    useEffect(() => {
        calculateTotal();
    }, [cart, discount, calculateTotal]);

    useEffect(() => {
        refreshCategories();
        refreshItems();
        refreshData();

        console.log(items);
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

                                return <h3>Subtotal: {formatCAD(total * 100)}</h3>;
                            })()}
                        </Box>
                    )}
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5 }}>
                        <Button variant="outlined" onClick={applyMemberDiscount}>
                            Apply Skull Discount
                        </Button>
                        <Button variant="outlined" onClick={clearCart}>
                            Clear Cart
                        </Button>
                        <Button
                            variant={paymentMethod === 'card' ? 'solid' : 'outlined'}
                            onClick={() => setPaymentMethod('card')}
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
                </Box>

            </Box>
        </Box >
    );
};

export default POS;

// debit/credit brings up a modal for pending transaction for stripe to handle
// cash brings up a modal to enter amount received and calculates change due
