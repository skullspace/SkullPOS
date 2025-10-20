import React from "react";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import { Tooltip, Box, IconButton } from "@mui/material";
import { formatCAD } from "../../utils/format";

// Renders a single cart line
// Props: cartItem, onRemove
const CartItem = ({ cartItem, onRemove, onIncrement, onDecrement }) => {
    const handleIncrement = () => {
        if (typeof onIncrement === "function") {
            onIncrement(cartItem.$id);
        }
    };

    const handleDecrement = () => {
        if (typeof onDecrement === "function") {
            onDecrement(cartItem.$id);
            return;
        }
        // fallback: if quantity <= 1, remove the item; otherwise do nothing
        if ((cartItem.quantity || 1) <= 1) {
            if (typeof onRemove === "function") onRemove(cartItem.$id);
        }
    };
    return (
        <Box
            key={cartItem.$id}
            sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
                py: 0.5 * 1.4,
                transition: "background-color 120ms ease",
                "&:hover": {
                    backgroundColor: (theme) =>
                        (theme &&
                            theme.palette &&
                            theme.palette.action &&
                            theme.palette.action.hover) ||
                        (theme &&
                            theme.vars &&
                            theme.vars.palette &&
                            theme.vars.palette.background &&
                            theme.vars.palette.background.surface) ||
                        "rgba(0,0,0,0.04)",
                },
            }}
        >
            <Box sx={{ display: "flex", flexDirection: "column" }}>
                <Box
                    component="div"
                    sx={{ fontSize: `${0.95 * 1.4}rem`, fontWeight: 600 }}
                >
                    {cartItem.name}
                </Box>
                <Box
                    component="div"
                    sx={{
                        fontSize: `${0.85 * 1.4}rem`,
                        color: "text.secondary",
                    }}
                >
                    {formatCAD(cartItem.price)}
                </Box>
                <Box
                    component="div"
                    sx={{
                        fontSize: `${0.8 * 1.4}rem`,
                        color: "text.secondary",
                    }}
                >
                    Qty: {cartItem.quantity}
                </Box>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                {/* total cost = price * qty */}
                <Box
                    component="div"
                    sx={{
                        fontWeight: 700,
                        fontSize: `${1 * 1.4}rem`,
                        mr: 0.5,
                        color: "text.primary",
                    }}
                >
                    {formatCAD(
                        (cartItem.price || 0) * (cartItem.quantity || 1)
                    )}
                </Box>

                <Box
                    sx={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 0.5,
                    }}
                >
                    <Tooltip title={`Add one ${cartItem.name}`}>
                        <IconButton
                            size="sm"
                            color="neutral"
                            onClick={handleIncrement}
                            aria-label={`Add one ${cartItem.name}`}
                            sx={{ transform: "scale(1.2)" }}
                        >
                            <AddIcon sx={{ fontSize: `${16 * 1.2}px` }} />
                        </IconButton>
                    </Tooltip>

                    <Tooltip title={`Remove ${cartItem.name}`}>
                        <IconButton
                            size="sm"
                            color="neutral"
                            onClick={() => onRemove(cartItem.$id, true)}
                            aria-label={`Remove ${cartItem.name}`}
                            sx={{ transform: "scale(1.4)" }}
                        >
                            <DeleteIcon
                                fontSize="small"
                                sx={{ fontSize: `${16 * 1.4}px` }}
                            />
                        </IconButton>
                    </Tooltip>

                    <Tooltip title={`Decrease quantity of ${cartItem.name}`}>
                        <IconButton
                            size="sm"
                            color="neutral"
                            onClick={handleDecrement}
                            aria-label={`Decrease ${cartItem.name}`}
                            sx={{ transform: "scale(1.2)" }}
                        >
                            <RemoveIcon sx={{ fontSize: `${16 * 1.2}px` }} />
                        </IconButton>
                    </Tooltip>
                </Box>
            </Box>
        </Box>
    );
};

export default CartItem;
