/**
 * GiftcardDisplay.js - Reusable giftcard info display component
 * 
 * Shows loaded giftcard balance and allows clearing
 */

import React from "react";
import { Box, Button } from "@mui/material";
import { formatCAD } from "../../../utils/format";

/**
 * GiftcardDisplay component
 *
 * @param {Object} props - Component props
 * @param {Object} props.giftcard - Giftcard object with $id and balance
 * @param {Function} props.onClear - Callback when clearing giftcard
 * @param {boolean} props.isProcessing - Whether transaction is in progress
 * @param {{applied: number, remaining: number}|null} [props.usage] - Set once this giftcard has
 *   partially covered a sale (see checkout.js/retryCheckout.js) -- the amount actually applied
 *   and what's still owed on the card, so the cashier isn't left guessing after a failed retry.
 *
 * @returns {JSX.Element} Giftcard info display, or null if no giftcard
 */
const GiftcardDisplay = ({ giftcard, onClear, isProcessing = false, usage = null }) => {
	if (!giftcard) return null;

	// Mask giftcard ID, showing only last 8 characters
	const maskGiftcardId = (id) => {
		const idStr = id || "";
		if (idStr.length <= 8) return idStr;
		return "****" + idStr.slice(-8);
	};

	return (
		<Box
			sx={{
				mb: 1,
				display: "flex",
				justifyContent: "space-between",
				alignItems: "center",
			}}
		>
			<div>
				<strong>{giftcard.eventId ? "DJ Voucher" : "Giftcard"}:</strong> {maskGiftcardId(giftcard.$id)}
				<div>Balance: {formatCAD(giftcard.balance || 0)}</div>
				{usage && usage.remaining > 0 && (
					<div>
						Applied {formatCAD(usage.applied || 0)} -- {formatCAD(usage.remaining)} remaining on card
					</div>
				)}
			</div>
			<Button
				size="small"
				onClick={onClear}
				disabled={isProcessing}
			>
				Clear
			</Button>
		</Box>
	);
};

export default GiftcardDisplay;
