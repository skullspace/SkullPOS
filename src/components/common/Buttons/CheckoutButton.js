/**
 * CheckoutButton.js - Reusable checkout button component
 * 
 * Handles checkout button state and disabled conditions
 */

import React from "react";
import { Box, Button, Tooltip, IconButton } from "@mui/material";
import CheckoutIcon from "@mui/icons-material/ShoppingCartCheckout";
import DeleteIcon from "@mui/icons-material/Delete";

/**
 * CheckoutButton component
 * 
 * @param {Object} props - Component props
 * @param {number} props.cartItemCount - Number of items in cart
 * @param {boolean} props.isTerminalReady - Whether Stripe terminal is ready
 * @param {string} props.paymentMethod - Current payment method
 * @param {Function} props.onCheckout - Callback for checkout
 * @param {Function} props.onClearCart - Callback to clear cart
 * @param {boolean} props.isProcessing - Whether transaction is in progress
 * 
 * @returns {JSX.Element} Checkout button with clear button
 */
const CheckoutButton = ({
	cartItemCount,
	isTerminalReady,
	paymentMethod,
	onCheckout,
	onClearCart,
	isProcessing = false,
}) => {
	const isCheckoutDisabled =
		cartItemCount === 0 ||
		(paymentMethod === "stripe" && !isTerminalReady) ||
		isProcessing;

	return (
		<Box
			sx={{
				display: "grid",
				gridTemplateColumns: "3fr 1fr",
				gap: 0.5,
				alignItems: "end",
			}}
		>
			{/* Checkout Button */}
			<Box
				sx={{
					height: "100%",
					display: "flex",
					flexDirection: "column",
					justifyContent: "end",
				}}
			>
				{isCheckoutDisabled && cartItemCount === 0 ? (
					<Tooltip title="Cart is empty">
						<span>
							<Button
								color="primary"
								variant="contained"
								size="large"
								fullWidth
								sx={{ mt: 0, fontWeight: 700, py: 1.25 }}
								onClick={onCheckout}
								disabled
							>
								<CheckoutIcon fontSize="small" sx={{ mr: 1 }} />
								Checkout
							</Button>
						</span>
					</Tooltip>
				) : isCheckoutDisabled &&
				  paymentMethod === "stripe" &&
				  !isTerminalReady ? (
					<Tooltip title="Terminal not ready">
						<span>
							<Button
								color="primary"
								variant="contained"
								size="large"
								fullWidth
								sx={{ mt: 0, fontWeight: 700, py: 1.25 }}
								onClick={onCheckout}
								disabled
							>
								<CheckoutIcon fontSize="small" sx={{ mr: 1 }} />
								Checkout
							</Button>
						</span>
					</Tooltip>
				) : (
					<Button
						color="primary"
						variant="contained"
						size="large"
						fullWidth
						sx={{ mt: 0, fontWeight: 700, py: 1.25 }}
						onClick={onCheckout}
						disabled={isProcessing}
					>
						<CheckoutIcon fontSize="small" sx={{ mr: 1 }} />
						Checkout
					</Button>
				)}
			</Box>

			{/* Clear Cart Button */}
			<IconButton
				variant="contained"
				color="secondary"
				onClick={onClearCart}
				aria-label="Clear cart"
				sx={{ mt: 0 }}
				disabled={isProcessing || cartItemCount === 0}
			>
				<DeleteIcon fontSize="small" />
			</IconButton>
		</Box>
	);
};

export default CheckoutButton;
