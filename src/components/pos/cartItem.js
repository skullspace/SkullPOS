import React from "react";
import { Box, IconButton } from "@mui/joy";
import DeleteIcon from "@mui/icons-material/Delete";
import { Tooltip } from "@mui/material";
import { formatCAD } from "../../utils/format";

// Renders a single cart line
// Props: cartItem, onRemove
const CartItem = ({ cartItem, onRemove }) => {
    return (
        <Box
            key={cartItem.$id}
            sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
                py: 0.5,
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
                    sx={{ fontSize: "0.95rem", fontWeight: 600 }}
                >
                    {cartItem.name}
                </Box>
                <Box
                    component="div"
                    sx={{ fontSize: "0.85rem", color: "text.secondary" }}
                >
                    {formatCAD(cartItem.price)}
                </Box>
                <Box
                    component="div"
                    sx={{ fontSize: "0.8rem", color: "text.secondary" }}
                >
                    Qty: {cartItem.quantity}
                </Box>
            </Box>
            <Box>
                <Tooltip title={`Remove ${cartItem.name}`}>
                    <IconButton
                        size="sm"
                        color="neutral"
                        onClick={() => onRemove(cartItem.$id)}
                        aria-label={`Remove ${cartItem.name}`}
                    >
                        <DeleteIcon fontSize="small" />
                    </IconButton>
                </Tooltip>
            </Box>
        </Box>
    );
};

export default CartItem;
