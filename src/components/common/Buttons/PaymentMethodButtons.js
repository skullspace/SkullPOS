/**
 * PaymentMethodButtons.js - Reusable payment method selector buttons
 * 
 * Displays payment method options (Card, Cash, Member Discount)
 * with visual feedback and disabled states
 */

import React from "react";
import { Box, Button, Tooltip } from "@mui/material";
import CreditCardIcon from "@mui/icons-material/CreditCard";
import MoneyIcon from "@mui/icons-material/AttachMoney";

/**
 * PaymentMethodButtons component
 * 
 * @param {Object} props - Component props
 * @param {string} props.currentMethod - Currently selected payment method
 * @param {Function} props.onMethodChange - Callback when method changes
 * @param {boolean} props.isTerminalReady - Whether Stripe terminal is ready
 * @param {boolean} props.isMemberDiscountApplied - Whether member discount is active
 * @param {Function} props.onToggleMemberDiscount - Callback for discount toggle
 * @param {boolean} props.isProcessing - Whether transaction is in progress
 * 
 * @returns {JSX.Element} Payment method selector buttons
 */
const PaymentMethodButtons = ({
	currentMethod,
	onMethodChange,
	isTerminalReady,
	isMemberDiscountApplied,
	onToggleMemberDiscount,
	isProcessing = false,
}) => {
	const isCardDisabled = !isTerminalReady || isProcessing;

	const buttonSx = {
		minHeight: 56,
		px: 0.5,
		fontSize: "0.85rem",
		lineHeight: 1.15,
		whiteSpace: "normal",
		textAlign: "center",
	};

	return (
		<Box
			sx={{
				display: "grid",
				gridTemplateColumns: "1fr 1fr 1.3fr",
				mb: 0.5,
				gap: 0.5,
			}}
		>
			{/* Card Payment Button */}
			<Tooltip title={isCardDisabled ? "Terminal not ready" : "Pay with card"}>
				<span style={{ display: "block" }}>
					<Button
						loadingIndicator="..."
						loading={!isTerminalReady}
						startIcon={<CreditCardIcon fontSize="small" />}
						disabled={isCardDisabled}
						variant={currentMethod === "stripe" ? "outlined" : "contained"}
						fullWidth
						sx={buttonSx}
						onClick={() => onMethodChange("stripe")}
					>
						Card
					</Button>
				</span>
			</Tooltip>

			{/* Cash Payment Button */}
			<Button
				startIcon={<MoneyIcon fontSize="small" />}
				variant={currentMethod === "cash" ? "outlined" : "contained"}
				fullWidth
				sx={buttonSx}
				onClick={() => onMethodChange("cash")}
				disabled={isProcessing}
			>
				Cash
			</Button>

			{/* Member Discount Button */}
			<Button
				startIcon={<MoneyIcon fontSize="small" />}
				variant={isMemberDiscountApplied ? "outlined" : "contained"}
				fullWidth
				sx={buttonSx}
				onClick={() => onToggleMemberDiscount(!isMemberDiscountApplied)}
				disabled={isProcessing}
			>
				Member Discount
			</Button>
		</Box>
	);
};

export default PaymentMethodButtons;
