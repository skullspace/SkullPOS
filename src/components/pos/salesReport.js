/* eslint-disable react-hooks/exhaustive-deps */
import React from "react";
import { useAppwrite } from "../../utils/api";
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
	TableSortLabel,
	Paper,
	TextField,
	Button,
} from "@mui/material";
import { formatCAD } from "../../utils/format";

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
	m: 0,
};

const SalesReport = ({ open, onClose }) => {
	const { fetchSalesReport } = useAppwrite();
	const [loading, setLoading] = React.useState(false);
	const [reportData, setReportData] = React.useState(null);
	const [orderBy, setOrderBy] = React.useState("quantity");
	const [order, setOrder] = React.useState("desc");
	const [startDate, setStartDate] = React.useState("");
	const [endDate, setEndDate] = React.useState("");

	// set end date to now by default
	React.useEffect(() => {
		const now = new Date();
		const nowStr = now.toISOString().slice(0, 16);
		setEndDate(nowStr);
	}, []);

	React.useEffect(() => {
		if (open) {
			handleQuickSelect("24hours");
		}
	}, [open]);

	React.useEffect(() => {
		if (startDate && endDate) {
			setLoading(true);
			getReport(startDate, endDate).finally(() => setLoading(false));
		}
	}, [startDate, endDate]);

	const handleSort = (property) => {
		const isAsc = orderBy === property && order === "asc";
		setOrder(isAsc ? "desc" : "asc");
		setOrderBy(property);
	};

	const getSortedItems = () => {
		if (!reportData?.ItemsSold) return [];

		let sorted = [...reportData.ItemsSold];
		const comparator = (a, b) => {
			let aVal, bVal;

			if (orderBy === "revenue") {
				aVal = (a.quantity || 0) * (a.revenue || 0);
				bVal = (b.quantity || 0) * (b.revenue || 0);
			} else if (orderBy === "quantity") {
				aVal = a.quantity || 0;
				bVal = b.quantity || 0;
			} else {
				aVal = a.name || "";
				bVal = b.name || "";
			}

			if (aVal < bVal) return order === "asc" ? -1 : 1;
			if (aVal > bVal) return order === "asc" ? 1 : -1;
			return 0;
		};

		return sorted.sort(comparator);
	};

	const handleQuickSelect = (range) => {
		const now = new Date();
		let start = new Date();

		switch (range) {
			case "12hours":
				start.setTime(now.getTime() - 12 * 60 * 60 * 1000);
				break;
			case "24hours":
				start.setTime(now.getTime() - 24 * 60 * 60 * 1000);
				break;
			case "week":
				start.setDate(now.getDate() - 7);
				break;
			case "alltime":
				start = null;
				break;
			default:
				break;
		}

		const startStr = start ? start.toISOString().slice(0, 16) : "";
		const endStr = now.toISOString().slice(0, 16);

		setStartDate(startStr);
		setEndDate(endStr);
		setLoading(true);
		getReport(startStr, endStr).finally(() => setLoading(false));
	};

	const getReport = (start = null, end = null) => {
		let startDt = start ? new Date(start) : null;
		let endDt = end ? new Date(end) : null;

		return fetchSalesReport(startDt, endDt)
			.then((data) => setReportData(data))
			.catch((error) => {
				console.error("Error fetching sales report:", error);
				setReportData(null);
			});
	};

	return (
		<Modal
			open={open}
			onClose={onClose}
			aria-labelledby="sales-report-title"
			style={{ margin: 0 }}
		>
			<Box sx={modalStyle}>
				<Typography id="txn-progress-title" variant="h6" component="h2">
					Sales Report
				</Typography>
				<Box sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap" }}>
					<Button
						size="small"
						variant="outlined"
						onClick={() => handleQuickSelect("12hours")}
					>
						Last 12 Hours
					</Button>
					<Button
						size="small"
						variant="outlined"
						onClick={() => handleQuickSelect("24hours")}
					>
						Last 24 Hours
					</Button>
					<Button
						size="small"
						variant="outlined"
						onClick={() => handleQuickSelect("week")}
					>
						Last Week
					</Button>
					<Button
						size="small"
						variant="outlined"
						onClick={() => handleQuickSelect("alltime")}
					>
						All Time
					</Button>
				</Box>
				<Box sx={{ display: "flex", gap: 2, mb: 2 }}>
					<TextField
						type="datetime-local"
						label="Start Date"
						value={startDate}
						onChange={(e) => setStartDate(e.target.value)}
						InputLabelProps={{ shrink: true }}
						size="small"
						sx={{ flex: 1 }}
					/>
					<TextField
						type="datetime-local"
						label="End Date"
						value={endDate}
						onChange={(e) => setEndDate(e.target.value)}
						InputLabelProps={{ shrink: true }}
						size="small"
						sx={{ flex: 1 }}
					/>
				</Box>
				<Box
					sx={{
						display: "flex",
						alignItems: "center",
						gap: 2,
					}}
				>
					{loading ? (
						<Box
							sx={{
								height: "60vh",
							}}
						>
							<CircularProgress size={36} />
							<Typography id="txn-progress-desc">
								Please wait while the report is generated...
							</Typography>
						</Box>
					) : (
						<Box
							sx={{
								height: "60vh",
								overflow: "auto",
								width: "100%",
								p: 2,
							}}
						>
							{reportData ? (
								<Box>
									<Box>
										<Box
											sx={{
												display: "flex",
												justifyContent: "space-between",
											}}
										>
											<Typography>
												Sale Volume:
											</Typography>
											<Typography>
												{formatCAD(
													reportData.totalSales,
												)}
											</Typography>
										</Box>
										<hr />
										<Box
											sx={{
												display: "flex",
												justifyContent: "space-between",
											}}
										>
											<Typography>
												Discount Amount:
											</Typography>
											<Typography>
												{formatCAD(
													reportData.discountAmount,
												)}
											</Typography>
										</Box>
										<Box
											sx={{
												display: "flex",
												justifyContent: "space-between",
											}}
										>
											<Typography>
												Gift Card Amount:
											</Typography>
											<Typography>
												{formatCAD(
													reportData.giftcardAmount,
												)}
											</Typography>
										</Box>
										<Box
											sx={{
												display: "flex",
												justifyContent: "space-between",
											}}
										>
											<Typography>
												Tips Earned:
											</Typography>
											<Typography>
												{formatCAD(reportData.tips)}
											</Typography>
										</Box>
										<hr />
										<Box
											sx={{
												display: "flex",
												justifyContent: "space-between",
											}}
										>
											<Typography>
												Cash Amount:
											</Typography>
											<Typography>
												{formatCAD(
													reportData.cashAmount,
												)}
											</Typography>
										</Box>
										<Box
											sx={{
												display: "flex",
												justifyContent: "space-between",
											}}
										>
											<Typography>
												Card Amount:
											</Typography>
											<Typography>
												{formatCAD(
													reportData.cardAmount,
												)}
											</Typography>
										</Box>
										<hr />
										<Box
											sx={{
												display: "flex",
												justifyContent: "space-between",
											}}
										>
											<Typography>Revenue:</Typography>
											<Typography>
												{formatCAD(
													reportData.amountPaid,
												)}
											</Typography>
										</Box>
									</Box>
									<hr />
									<Typography variant="h6">
										Items Sold
									</Typography>
									<TableContainer
										component={Paper}
										sx={{
											width: "100%",
										}}
									>
										<Table stickyHeader size="small">
											<TableHead>
												<TableRow>
													<TableCell>
														<TableSortLabel
															active={
																orderBy ===
																"name"
															}
															direction={
																orderBy ===
																"name"
																	? order
																	: "asc"
															}
															onClick={() =>
																handleSort(
																	"name",
																)
															}
														>
															Item
														</TableSortLabel>
													</TableCell>
													<TableCell align="right">
														<TableSortLabel
															active={
																orderBy ===
																"quantity"
															}
															direction={
																orderBy ===
																"quantity"
																	? order
																	: "asc"
															}
															onClick={() =>
																handleSort(
																	"quantity",
																)
															}
														>
															Quantity
														</TableSortLabel>
													</TableCell>
													<TableCell align="right">
														<TableSortLabel
															active={
																orderBy ===
																"revenue"
															}
															direction={
																orderBy ===
																"revenue"
																	? order
																	: "asc"
															}
															onClick={() =>
																handleSort(
																	"revenue",
																)
															}
														>
															Revenue
														</TableSortLabel>
													</TableCell>
												</TableRow>
											</TableHead>
											<TableBody>
												{getSortedItems().map(
													(item, index) => (
														<TableRow key={index}>
															<TableCell>
																{item.name}
															</TableCell>
															<TableCell align="right">
																{item.quantity}
															</TableCell>
															<TableCell align="right">
																{formatCAD(
																	item.revenue *
																		100 ||
																		0,
																)}
															</TableCell>
														</TableRow>
													),
												)}
											</TableBody>
										</Table>
									</TableContainer>
								</Box>
							) : (
								<Typography>No data available.</Typography>
							)}
						</Box>
					)}
				</Box>
			</Box>
		</Modal>
	);
};

export default SalesReport;
