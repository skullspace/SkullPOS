import React from "react";
import {
	Box,
	Typography,
	Modal,
	CircularProgress,
	Table,
	TableBody,
	TableCell,
	TableContainer,
	TableHead,
	TableRow,
	Paper,
	Button,
	Chip,
	Collapse,
	IconButton,
	Dialog,
	DialogTitle,
	DialogContent,
	DialogActions,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import { formatCAD } from "../../utils/format";
import { refundTransaction } from "../../utils/refund";

const modalStyle = {
	position: "absolute",
	top: "50%",
	left: "50%",
	transform: "translate(-50%, -50%)",
	bgcolor: "background.paper",
	boxShadow: 24,
	p: 2,
	borderRadius: 2,
	minWidth: "50%",
	m: 0,
};

const STATUS_COLOR = {
	complete: "success",
	pending: "warning",
	cancelled: "default",
	refunded: "info",
};

function parseCart(cartJson) {
	try {
		return JSON.parse(cartJson) || [];
	} catch (err) {
		return [];
	}
}

function TransactionRow({ transaction, isRefunding, onRefund, restricted }) {
	const [expanded, setExpanded] = React.useState(false);
	const cart = React.useMemo(() => parseCart(transaction.cart), [transaction.cart]);

	return (
		<>
			<TableRow hover onClick={() => setExpanded((v) => !v)} sx={{ cursor: "pointer" }}>
				<TableCell padding="checkbox">
					<IconButton size="small">
						{expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
					</IconButton>
				</TableCell>
				<TableCell>{new Date(transaction.$createdAt).toLocaleString()}</TableCell>
				<TableCell align="right">{formatCAD(transaction.total || 0)}</TableCell>
				<TableCell>{transaction.payment_method}</TableCell>
				<TableCell>
					<Chip size="small" label={transaction.status} color={STATUS_COLOR[transaction.status] || "default"} />
				</TableCell>
			</TableRow>
			<TableRow>
				<TableCell colSpan={5} sx={{ py: 0, borderBottom: expanded ? undefined : "none" }}>
					<Collapse in={expanded} timeout="auto" unmountOnExit>
						<Box sx={{ py: 2, px: 1 }}>
							<Table size="small">
								<TableHead>
									<TableRow>
										<TableCell>Item</TableCell>
										<TableCell align="right">Qty</TableCell>
										<TableCell align="right">Price</TableCell>
										<TableCell align="right">Subtotal</TableCell>
									</TableRow>
								</TableHead>
								<TableBody>
									{cart.length === 0 ? (
										<TableRow>
											<TableCell colSpan={4}>No cart data.</TableCell>
										</TableRow>
									) : (
										cart.map((item, i) => (
											<TableRow key={i}>
												<TableCell>{item.name}</TableCell>
												<TableCell align="right">{item.quantity}</TableCell>
												<TableCell align="right">{formatCAD(item.price || 0)}</TableCell>
												<TableCell align="right">
													{formatCAD((item.price || 0) * (item.quantity || 0))}
												</TableCell>
											</TableRow>
										))
									)}
								</TableBody>
							</Table>

							<Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, mt: 2, maxWidth: 320 }}>
								<Box sx={{ display: "flex", justifyContent: "space-between" }}>
									<Typography variant="body2" color="text.secondary">Discount</Typography>
									<Typography variant="body2">{formatCAD(transaction.discount || 0)}</Typography>
								</Box>
								<Box sx={{ display: "flex", justifyContent: "space-between" }}>
									<Typography variant="body2" color="text.secondary">Tip</Typography>
									<Typography variant="body2">{formatCAD(transaction.tip || 0)}</Typography>
								</Box>
								<Box sx={{ display: "flex", justifyContent: "space-between" }}>
									<Typography variant="body2" color="text.secondary">Gift Card Applied</Typography>
									<Typography variant="body2">{formatCAD(transaction.giftcard_amount || 0)}</Typography>
								</Box>
								<Box sx={{ display: "flex", justifyContent: "space-between" }}>
									<Typography variant="body2" color="text.secondary">Amount Paid</Typography>
									<Typography variant="body2">{formatCAD(transaction.payment_due || 0)}</Typography>
								</Box>
								{transaction.CreatedBy && (
									<Box sx={{ display: "flex", justifyContent: "space-between" }}>
										<Typography variant="body2" color="text.secondary">Created By</Typography>
										<Typography variant="body2">{transaction.CreatedBy}</Typography>
									</Box>
								)}
							</Box>

							{transaction.status === "complete" && !restricted && (
								<Button
									sx={{ mt: 2 }}
									size="small"
									color="error"
									variant="outlined"
									disabled={isRefunding}
									onClick={(e) => {
										e.stopPropagation();
										onRefund(transaction);
									}}
								>
									{isRefunding ? "Refunding..." : "Refund"}
								</Button>
							)}
						</Box>
					</Collapse>
				</TableCell>
			</TableRow>
		</>
	);
}

const TransactionsView = ({
	open,
	onClose,
	functions,
	fetchTransactions,
	setStripeAlert,
	restricted,
}) => {
	const [loading, setLoading] = React.useState(false);
	const [transactions, setTransactions] = React.useState([]);
	const [pendingRefund, setPendingRefund] = React.useState(null);
	const [refundingId, setRefundingId] = React.useState(null);

	const loadRecent = React.useCallback(() => {
		setLoading(true);
		fetchTransactions()
			.then(setTransactions)
			.catch((err) => {
				console.error("Error fetching transactions:", err);
				setStripeAlert({ active: true, message: "Failed to load transactions", type: "error" });
			})
			.finally(() => setLoading(false));
	}, [fetchTransactions, setStripeAlert]);

	React.useEffect(() => {
		if (open) loadRecent();
	}, [open, loadRecent]);

	const doRefund = async () => {
		const transaction = pendingRefund;
		if (!transaction || restricted) return;
		setPendingRefund(null);
		setRefundingId(transaction.$id);
		try {
			await refundTransaction({ functions, transaction });
			setStripeAlert({ active: true, message: "Transaction refunded", type: "success" });
			loadRecent();
		} catch (err) {
			console.error("Refund failed:", err);
			setStripeAlert({ active: true, message: err.message || "Refund failed", type: "error" });
		} finally {
			setRefundingId(null);
		}
	};

	return (
		<>
			<Modal open={open} onClose={onClose} aria-labelledby="transactions-title" style={{ margin: 0 }}>
				<Box sx={modalStyle}>
					<Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
						<Typography id="transactions-title" variant="h6" component="h2">
							Transactions (last 24 hours)
						</Typography>
						<Button size="small" variant="outlined" onClick={loadRecent}>
							Refresh
						</Button>
					</Box>

					{loading ? (
						<Box sx={{ height: "40vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
							<CircularProgress size={36} />
						</Box>
					) : (
						<TableContainer component={Paper} sx={{ maxHeight: "60vh" }}>
							<Table stickyHeader size="small">
								<TableHead>
									<TableRow>
										<TableCell padding="checkbox" />
										<TableCell>Time</TableCell>
										<TableCell align="right">Total</TableCell>
										<TableCell>Payment</TableCell>
										<TableCell>Status</TableCell>
									</TableRow>
								</TableHead>
								<TableBody>
									{transactions.length === 0 ? (
										<TableRow>
											<TableCell colSpan={5}>
												<Typography sx={{ p: 2 }}>No transactions in this range.</Typography>
											</TableCell>
										</TableRow>
									) : (
										transactions.map((t) => (
											<TransactionRow
												key={t.$id}
												transaction={t}
												isRefunding={refundingId === t.$id}
												onRefund={setPendingRefund}
												restricted={restricted}
											/>
										))
									)}
								</TableBody>
							</Table>
						</TableContainer>
					)}
				</Box>
			</Modal>

			<Dialog open={!!pendingRefund} onClose={() => setPendingRefund(null)}>
				<DialogTitle>Refund this transaction?</DialogTitle>
				<DialogContent>
					{pendingRefund && (
						<Typography>
							Refund {formatCAD(pendingRefund.total || 0)} paid by {pendingRefund.payment_method}
							{pendingRefund.payment_method !== "cash" ? " -- this cannot be undone." : ", and hand the cash back."}
						</Typography>
					)}
				</DialogContent>
				<DialogActions>
					<Button onClick={() => setPendingRefund(null)}>Cancel</Button>
					<Button color="error" variant="contained" onClick={doRefund}>
						Refund
					</Button>
				</DialogActions>
			</Dialog>
		</>
	);
};

export default TransactionsView;
