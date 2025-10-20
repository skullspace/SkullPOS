import React from "react";
import { Box, Button, IconButton } from "@mui/joy";
import {
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Tooltip,
} from "@mui/material";
import CreditCardIcon from "@mui/icons-material/CreditCard";
import MoneyIcon from "@mui/icons-material/AttachMoney";
import CheckoutIcon from "@mui/icons-material/ShoppingCartCheckout";
import DeleteIcon from "@mui/icons-material/Delete";
import { formatCAD } from "../../utils/format";
import CartItem from "./cartItem";

const Cart = ({
    cart,
    member_discount_applied,
    applyMemberDiscount,
    clearCart,
    removeItemFromCart,
    total,
    terminalReady,
    paymentMethod,
    setPaymentMethod,
    checkout,
    terminals,
    selectedTerminal,
    setSelectedTerminal,
}) => {
    return (
        <Box
            sx={{
                width: "20vw",
                minWidth: 240,
                maxWidth: "30%",
                p: 2,
                display: "flex",
                flexDirection: "column",
                height: "95%",
            }}
        >
            {/* dropdown to select terminal */}
            <FormControl fullWidth>
                {terminals.length > 0 && (
                    <>
                        <InputLabel id="terminal-select-label">
                            Select Terminal
                        </InputLabel>
                        <Select
                            labelId="terminal-select-label"
                            value={selectedTerminal}
                            onChange={(e) =>
                                setSelectedTerminal(e.target.value)
                            }
                        >
                            {terminals.map((terminal) => (
                                <MenuItem key={terminal.id} value={terminal}>
                                    {terminal.label}
                                </MenuItem>
                            ))}
                        </Select>
                    </>
                )}
            </FormControl>
            <Box sx={{ flex: 1, overflow: "auto" }}>
                {member_discount_applied && (
                    <Box
                        sx={{
                            position: "sticky",
                            top: 0,
                            background: "background.surface",
                            zIndex: 1,
                            mb: 0,
                            p: 0,
                            borderBottom: "1px solid",
                        }}
                    >
                        <p>Member discount applied</p>
                    </Box>
                )}
                {cart.length === 0 ? (
                    <p>The cart is empty</p>
                ) : (
                    <Box>
                        {cart.map((cartItem) => (
                            <CartItem
                                key={cartItem.$id}
                                cartItem={cartItem}
                                onRemove={removeItemFromCart}
                            />
                        ))}
                    </Box>
                )}
            </Box>

            <Box
                sx={{
                    position: "sticky",
                    bottom: 0,
                    mt: 0,
                    background: "background.surface",
                    p: 0,
                }}
            >
                {cart.length > 0 && (
                    <Box sx={{ mt: 2 }}>
                        {(() => {
                            return <h3>Subtotal: {formatCAD(total)}</h3>;
                        })()}
                    </Box>
                )}
                <Box
                    sx={{
                        display: "grid",
                        gridTemplateColumns: "3fr 1fr",
                        gap: 0.5,
                        alignItems: "end",
                    }}
                >
                    <Box
                        sx={{
                            height: "100%",
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "end",
                        }}
                    >
                        <Box sx={{ display: "flex", gap: 0.5, mb: 1 }}>
                            <Button
                                startDecorator={
                                    <CreditCardIcon fontSize="small" />
                                }
                                disabled={terminalReady ? false : true}
                                variant={
                                    paymentMethod === "stripe"
                                        ? "solid"
                                        : "outlined"
                                }
                                onClick={() => setPaymentMethod("stripe")}
                            >
                                Card
                            </Button>
                            <Button
                                startDecorator={<MoneyIcon fontSize="small" />}
                                variant={
                                    paymentMethod === "cash"
                                        ? "solid"
                                        : "outlined"
                                }
                                onClick={() => setPaymentMethod("cash")}
                            >
                                Cash
                            </Button>
                        </Box>

                        {cart.length === 0 ? (
                            <Tooltip title="Cart is empty">
                                <span>
                                    <Button
                                        color="primary"
                                        variant="solid"
                                        fullWidth
                                        sx={{ mt: 0 }}
                                        onClick={checkout}
                                        disabled
                                    >
                                        <CheckoutIcon
                                            fontSize="small"
                                            sx={{ mr: 1 }}
                                        />
                                        Checkout
                                    </Button>
                                </span>
                            </Tooltip>
                        ) : (
                            <Button
                                color="primary"
                                variant="solid"
                                fullWidth
                                sx={{ mt: 0 }}
                                onClick={checkout}
                            >
                                <CheckoutIcon fontSize="small" sx={{ mr: 1 }} />
                                Checkout
                            </Button>
                        )}
                    </Box>

                    <IconButton
                        variant="outlined"
                        color="neutral"
                        onClick={clearCart}
                        aria-label="Clear cart"
                        sx={{ mt: 0 }}
                    >
                        <DeleteIcon fontSize="small" />
                    </IconButton>
                </Box>
            </Box>
        </Box>
    );
};

export default Cart;
