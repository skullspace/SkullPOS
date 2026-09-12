/**
 * mySalesView.js - "My Sales" panel for a bartender's own PIN session.
 * Shows only their own sales total, tips, and a list of their own
 * transactions -- fetched via Bartender-Sales, which scopes everything
 * server-side to their bartenderId (see pinMode.bartenderId).
 */
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
} from "@mui/material";
import { formatCAD } from "../../utils/format";
import { fetchMySales } from "../../utils/bartenderSales";

const modalStyle = {
	position: "absolute",
	top: "50%",
	left: "50%",
	transform: "translate(-50%, -50%)",
	bgcolor: "background.paper",
	boxShadow: 24,
	p: 2,
	borderRadius: 2,
	minWidth: "40%",
	maxHeight: "85vh",
	overflow: "auto",
	m: 0,
};

function StatCard({ label, value }) {
	return (
		<Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, p: 1.5, flex: "1 1 150px", minWidth: 150 }}>
			<Typography variant="body2" color="text.secondary">
				{label}
			</Typography>
			<Typography variant="h6" sx={{ fontWeight: 700 }}>
				{value}
			</Typography>
		</Box>
	);
}

const MySalesView = ({ open, onClose, functions, bartenderId }) => {
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState("");
	const [data, setData] = React.useState(null);

	React.useEffect(() => {
		if (!open || !bartenderId) return;
		setLoading(true);
		setError("");
		fetchMySales({ functions, bartenderId })
			.then((result) => setData(result))
			.catch((err) => {
				console.error("Error fetching my sales:", err);
				setError(err.message || "Failed to load your sales");
			})
			.finally(() => setLoading(false));
	}, [open, bartenderId, functions]);

	return (
		<Modal open={open} onClose={onClose} aria-labelledby="my-sales-title" style={{ margin: 0 }}>
			<Box sx={modalStyle}>
				<Typography id="my-sales-title" variant="h6" sx={{ mb: 2 }}>
					My Sales
				</Typography>

				{loading ? (
					<Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
						<CircularProgress />
					</Box>
				) : error ? (
					<Typography color="error">{error}</Typography>
				) : data ? (
					<>
						<Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", mb: 2 }}>
							<StatCard label="Total Sales" value={formatCAD(data.salesTotal)} />
							<StatCard label="Total Tips" value={formatCAD(data.tipsTotal)} />
							<StatCard label="Transactions" value={String(data.transactionCount)} />
						</Box>

						<TableContainer component={Paper} variant="outlined">
							<Table size="small">
								<TableHead>
									<TableRow>
										<TableCell>Date</TableCell>
										<TableCell align="right">Total</TableCell>
										<TableCell align="right">Tip</TableCell>
										<TableCell>Status</TableCell>
									</TableRow>
								</TableHead>
								<TableBody>
									{data.transactions.length === 0 ? (
										<TableRow>
											<TableCell colSpan={4} align="center">
												No sales yet.
											</TableCell>
										</TableRow>
									) : (
										data.transactions.map((t) => (
											<TableRow key={t.id}>
												<TableCell>{new Date(t.createdAt).toLocaleString()}</TableCell>
												<TableCell align="right">{formatCAD(t.total)}</TableCell>
												<TableCell align="right">{formatCAD(t.tip)}</TableCell>
												<TableCell>{t.status}</TableCell>
											</TableRow>
										))
									)}
								</TableBody>
							</Table>
						</TableContainer>
					</>
				) : null}

				<Box sx={{ display: "flex", justifyContent: "flex-end", mt: 2 }}>
					<Button onClick={onClose}>Close</Button>
				</Box>
			</Box>
		</Modal>
	);
};

export default MySalesView;
