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

const Modals = ({
	cashModalOpen,
	setCashModalOpen,
	checkoutSuccess,
	setCheckoutSuccess,
	checkoutError,
	setCheckoutError,
	onRetryCheckout,
	transactionInProgress,
	amountReceived,
	setAmountReceived,
	handleCashPayment,
	changeDue,
	formatCAD,
	handleCancelStripePayment,
	stopTransactionInProgress,
	paymentMethod,
}) => {
	if (transactionInProgress) {
		return (
			<Modal
				open
				aria-labelledby="txn-progress-title"
				aria-describedby="txn-progress-desc"
			>
				<Box sx={modalStyle}>
					<Typography
						id="txn-progress-title"
						variant="h6"
						component="h2"
					>
						Processing Transaction
					</Typography>
					<Box
						sx={{
							display: "flex",
							alignItems: "center",
							gap: 2,
							mt: 2,
						}}
					>
						<CircularProgress size={36} />
						<Typography id="txn-progress-desc">
							Please wait while the transaction completes...
						</Typography>
					</Box>
					{paymentMethod === "stripe" && (
						<Box
							sx={{
								display: "flex",
								justifyContent: "flex-end",
								mt: 3,
							}}
						>
							<Button
								color="error"
								variant="outlined"
								onClick={() => {
									if (paymentMethod === "stripe") {
										stopTransactionInProgress();
									}
								}}
							>
								Cancel
							</Button>
						</Box>
					)}
				</Box>
			</Modal>
		);
	}

	if (checkoutError) {
		return (
			<Modal open aria-labelledby="checkout-error-title">
				<Box sx={modalStyle}>
					<Typography
						id="checkout-error-title"
						variant="h6"
						component="h2"
					>
						Checkout Failed
					</Typography>
					<Typography sx={{ mt: 1, whiteSpace: "pre-wrap" }}>
						{checkoutError}
					</Typography>
					<Box
						sx={{
							display: "flex",
							justifyContent: "flex-end",
							gap: 1,
							mt: 3,
						}}
					>
						<Button
							variant="contained"
							onClick={() =>
								onRetryCheckout
									? onRetryCheckout()
									: setCheckoutError(false)
							}
							disabled={transactionInProgress}
							startIcon={
								transactionInProgress ? (
									<CircularProgress
										size={18}
										color="inherit"
									/>
								) : null
							}
						>
							Retry
						</Button>

						<Button
							onClick={() => {
								handleCancelStripePayment();
								setCheckoutError(false);
							}}
						>
							Close
						</Button>
					</Box>
				</Box>
			</Modal>
		);
	}

	if (cashModalOpen) {
		return (
			<Modal
				open={cashModalOpen}
				onClose={() => setCashModalOpen(false)}
				aria-labelledby="cash-modal-title"
			>
				<Box sx={modalStyle}>
					<Typography
						id="cash-modal-title"
						variant="h6"
						component="h2"
					>
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
						value={amountReceived}
						onChange={(e) => setAmountReceived(e.target.value)}
						fullWidth
						inputProps={{ min: 0, step: "0.01" }}
					/>

					<Box
						sx={{
							display: "flex",
							justifyContent: "flex-end",
							gap: 1,
							mt: 2,
						}}
					>
						<Button onClick={() => setCashModalOpen(false)}>
							Cancel
						</Button>
						<Button
							variant="contained"
							onClick={handleCashPayment}
							disabled={transactionInProgress}
							startIcon={
								transactionInProgress ? (
									<CircularProgress
										size={18}
										color="inherit"
									/>
								) : null
							}
						>
							Submit
						</Button>
					</Box>
				</Box>
			</Modal>
		);
	}

	if (checkoutSuccess) {
		return (
			<Modal
				open={checkoutSuccess}
				onClose={() => {
					setCheckoutSuccess(false);
				}}
				aria-labelledby="checkout-success-title"
			>
				<Box sx={modalStyle}>
					<Typography
						id="checkout-success-title"
						variant="h6"
						component="h2"
					>
						Checkout Successful
					</Typography>
					{changeDue > 0 && (
						<Typography sx={{ mt: 1 }}>
							Change Due: {formatCAD(changeDue)}
						</Typography>
					)}
					<Box
						sx={{
							display: "flex",
							justifyContent: "flex-end",
							mt: 3,
						}}
					>
						<Button onClick={() => setCheckoutSuccess(false)}>
							Close
						</Button>
					</Box>
				</Box>
			</Modal>
		);
	}

	return null;
};

export default Modals;
