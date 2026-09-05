/**
 * PaymentMethodButtons.js - Reusable payment method selector buttons
 *
 * Displays payment method options (Card, Cash, Discount) with visual
 * feedback and disabled states. The discount button opens a menu listing
 * whatever discounts are configured in the `discounts` collection, rather
 * than a single hardcoded "Member Discount" toggle.
 */

import React, { useState } from "react";
import { Box, Button, Menu, MenuItem, Tooltip } from "@mui/material";
import CreditCardIcon from "@mui/icons-material/CreditCard";
import MoneyIcon from "@mui/icons-material/AttachMoney";
import CallSplitIcon from "@mui/icons-material/CallSplit";
import { formatCAD } from "../../../utils/format";

/**
 * PaymentMethodButtons component
 *
 * @param {Object} props - Component props
 * @param {string} props.currentMethod - Currently selected payment method
 * @param {Function} props.onMethodChange - Callback when method changes
 * @param {boolean} props.isTerminalReady - Whether Stripe terminal is ready
 * @param {Array} props.discounts - Available discounts from the discounts collection
 * @param {Object|null} props.appliedDiscount - Currently applied discount, if any
 * @param {Function} props.onSelectDiscount - Callback with the chosen discount (or null to clear)
 * @param {boolean} props.isProcessing - Whether transaction is in progress
 *
 * @returns {JSX.Element} Payment method selector buttons
 */
const PaymentMethodButtons = ({
	currentMethod,
	onMethodChange,
	isTerminalReady,
	discounts = [],
	appliedDiscount,
	onSelectDiscount,
	isProcessing = false,
}) => {
	const isCardDisabled = !isTerminalReady || isProcessing;
	const [discountMenuAnchor, setDiscountMenuAnchor] = useState(null);
	const discountMenuOpen = Boolean(discountMenuAnchor);

	const buttonSx = {
		minHeight: 56,
		px: 0.5,
		fontSize: "0.85rem",
		lineHeight: 1.15,
		whiteSpace: "normal",
		textAlign: "center",
	};

	const formatDiscountAmount = (discount) =>
		discount.type === "percent" ? `${discount.amount}%` : formatCAD(discount.amount);

	return (
		<Box
			sx={{
				display: "grid",
				gridTemplateColumns: "1fr 1fr 1.3fr",
				mb: 0.5,
				gap: 0.5,
			}}
		>
			{/* Split Payment Button -- spans the full row above the rest,
			since it's a less-common path than the three primary methods */}
			<Button
				startIcon={<CallSplitIcon fontSize="small" />}
				variant={currentMethod === "split" ? "outlined" : "text"}
				fullWidth
				size="small"
				sx={{ gridColumn: "1 / -1", fontSize: "0.8rem" }}
				onClick={() => onMethodChange("split")}
				disabled={isProcessing}
			>
				Split Payment
			</Button>

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

			{/* Discount Button */}
			<Button
				startIcon={<MoneyIcon fontSize="small" />}
				variant={appliedDiscount ? "outlined" : "contained"}
				fullWidth
				sx={buttonSx}
				onClick={(e) => setDiscountMenuAnchor(e.currentTarget)}
				disabled={isProcessing || discounts.length === 0}
			>
				{appliedDiscount ? appliedDiscount.name : "Discount"}
			</Button>
			<Menu
				anchorEl={discountMenuAnchor}
				open={discountMenuOpen}
				onClose={() => setDiscountMenuAnchor(null)}
			>
				{discounts.map((discount) => (
					<MenuItem
						key={discount.$id}
						selected={appliedDiscount?.$id === discount.$id}
						onClick={() => {
							onSelectDiscount(discount);
							setDiscountMenuAnchor(null);
						}}
					>
						{discount.name} ({formatDiscountAmount(discount)})
					</MenuItem>
				))}
				{appliedDiscount && (
					<MenuItem
						onClick={() => {
							onSelectDiscount(null);
							setDiscountMenuAnchor(null);
						}}
					>
						Clear discount
					</MenuItem>
				)}
			</Menu>
		</Box>
	);
};

export default PaymentMethodButtons;
