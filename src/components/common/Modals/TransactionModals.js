/**
 * POS/TransactionModals.js - Transaction-related modals for POS
 * 
 * Consolidated modal dialogs for:
 * - Cash payment input
 * - Checkout success message
 * - Checkout error display
 * - Transaction processing indicator
 */

import React from "react";
import {
	Box,
	Button,
	Modal,
	CircularProgress,
	TextField,
	Typography,
} from "@mui/material";

const modalStyle = {
	position: "absolute",
	top: "50%",
	left: "50%",
	transform: "translate(-50%, -50%)",
	bgcolor: "background.paper",
	boxShadow: 24,
	p: 3,
	borderRadius: 2,
	minWidth: 320,
};

/**
 * Processing Modal - shown while transaction is in progress
 */
const ProcessingModal = ({ isProcessing, paymentMethod, onCancel }) => {
	if (!isProcessing) return null;
	
	return (
		<Modal
			open
			aria-labelledby="txn-progress-title"
			aria-describedby="txn-progress-desc"
		>
			<Box sx={modalStyle}>
				<Typography id="txn-progress-title" variant="h6" component="h2">
					Processing Transaction
				</Typography>
				<Box sx={{ display: "flex", alignItems: "center", gap: 2, mt: 2 }}>
					<CircularProgress size={36} />
					<Typography id="txn-progress-desc">
						Please wait while the transaction completes...
					</Typography>
				</Box>
				{paymentMethod === "stripe" && (
					<Box sx={{ display: "flex", justifyContent: "flex-end", mt: 3 }}>
						<Button
							color="error"
							variant="outlined"
							onClick={onCancel}
						>
							Cancel
						</Button>
					</Box>
				)}
			</Box>
		</Modal>
	);
};

/**
 * Error Modal - shown when checkout fails
 */
const ErrorModal = ({
	isOpen,
	errorMessage,
	isRetrying,
	onRetry,
	onClose,
}) => {
	if (!isOpen) return null;
	
	return (
		<Modal open aria-labelledby="checkout-error-title">
			<Box sx={modalStyle}>
				<Typography id="checkout-error-title" variant="h6" component="h2">
					Checkout Failed
				</Typography>
				<Typography sx={{ mt: 1, whiteSpace: "pre-wrap" }}>
					{errorMessage}
				</Typography>
				<Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1, mt: 3 }}>
					<Button
						variant="contained"
						onClick={onRetry}
						disabled={isRetrying}
						startIcon={
							isRetrying ? <CircularProgress size={18} color="inherit" /> : null
						}
					>
						Retry
					</Button>
					<Button onClick={onClose}>Close</Button>
				</Box>
			</Box>
		</Modal>
	);
};

/**
 * Cash Payment Modal - collects cash amount from user
 */
const CashPaymentModal = ({
	isOpen,
	amountPaid,
	onAmountChange,
	onSubmit,
	onClose,
	isProcessing,
}) => {
	if (!isOpen) return null;
	
	return (
		<Modal
			open={isOpen}
			onClose={onClose}
			aria-labelledby="cash-modal-title"
		>
			<Box sx={modalStyle}>
				<Typography id="cash-modal-title" variant="h6" component="h2">
					Cash Payment
				</Typography>

				<Typography sx={{ mt: 1 }}>
					Enter amount received
				</Typography>

				<TextField
					autoFocus
					margin="normal"
					label="Amount Received"
					type="number"
					value={amountPaid}
					onChange={(e) => onAmountChange(e.target.value)}
					fullWidth
					inputProps={{ min: 0, step: "0.01" }}
				/>

				<Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1, mt: 2 }}>
					<Button onClick={onClose}>Cancel</Button>
					<Button
						variant="contained"
						onClick={onSubmit}
						disabled={isProcessing}
						startIcon={
							isProcessing ? (
								<CircularProgress size={18} color="inherit" />
							) : null
						}
					>
						Submit
					</Button>
				</Box>
			</Box>
		</Modal>
	);
};

/**
 * Success Modal - shown after successful checkout
 */
const SuccessModal = ({
	isOpen,
	changeAmount,
	formatCAD,
	onClose,
	onClearCart,
}) => {
	if (!isOpen) return null;
	
	return (
		<Modal
			open={isOpen}
			onClose={onClose}
			aria-labelledby="checkout-success-title"
		>
			<Box sx={modalStyle}>
				<Typography id="checkout-success-title" variant="h6" component="h2">
					Checkout Successful
				</Typography>
				{changeAmount > 0 && (
					<Typography sx={{ mt: 1 }}>
						Change Due: {formatCAD(changeAmount)}
					</Typography>
				)}
				<Box sx={{ display: "flex", justifyContent: "flex-end", mt: 3 }}>
					<Button
						onClick={() => {
							onClose();
							onClearCart();
						}}
					>
						Close
					</Button>
				</Box>
			</Box>
		</Modal>
	);
};

export { ProcessingModal, ErrorModal, CashPaymentModal, SuccessModal };
