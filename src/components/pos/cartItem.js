import React from "react";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import { Tooltip, Box, IconButton, Typography } from "@mui/material";
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
                position: "relative",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 1,
                borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
                py: 0.5 * 1.4,
                pr: 4,
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
            <Tooltip title={`Remove ${cartItem.name}`}>
                <IconButton
                    size="small"
                    color="default"
                    onClick={() => onRemove(cartItem.$id, true)}
                    aria-label={`Remove ${cartItem.name}`}
                    sx={{
                        position: "absolute",
                        top: 0,
                        right: 0,
                        opacity: 0.6,
                        "&:hover": { opacity: 1 },
                    }}
                >
                    <DeleteIcon fontSize="small" />
                </IconButton>
            </Tooltip>

            <Box sx={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                <Box
                    component="div"
                    sx={{
                        fontSize: `${0.95 * 1.4}rem`,
                        fontWeight: 600,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                    }}
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
                    {formatCAD(cartItem.price)} each
                </Box>
            </Box>

            <Box
                sx={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-end",
                    gap: 0.5,
                    flexShrink: 0,
                }}
            >
                {/* total cost = price * qty */}
                <Box
                    component="div"
                    sx={{
                        fontWeight: 700,
                        fontSize: `${1 * 1.4}rem`,
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
                        alignItems: "center",
                        border: (theme) => `1px solid ${theme.palette.divider}`,
                        borderRadius: "999px",
                        gap: 0.25,
                    }}
                >
                    <Tooltip title={`Decrease quantity of ${cartItem.name}`}>
                        <IconButton
                            size="small"
                            color="default"
                            onClick={handleDecrement}
                            aria-label={`Decrease ${cartItem.name}`}
                        >
                            <RemoveIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>

                    <Typography
                        component="span"
                        sx={{
                            minWidth: 20,
                            textAlign: "center",
                            fontWeight: 600,
                            fontSize: "0.9rem",
                        }}
                    >
                        {cartItem.quantity}
                    </Typography>

                    <Tooltip title={`Add one ${cartItem.name}`}>
                        <IconButton
                            size="small"
                            color="default"
                            onClick={handleIncrement}
                            aria-label={`Add one ${cartItem.name}`}
                        >
                            <AddIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                </Box>
            </Box>
        </Box>
    );
};

export default CartItem;
