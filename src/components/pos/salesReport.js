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
			} else if (orderBy === "cogs") {
				aVal = a.cogs || 0;
				bVal = b.cogs || 0;
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

	const csvEscape = (value) => {
		const str = String(value ?? "");
		return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
	};

	const exportCsv = () => {
		if (!reportData) return;

		const rows = [
			["Sales Report"],
			["Start", startDate || "All time"],
			["End", endDate],
			[],
			["Sale Volume", formatCAD(reportData.totalSales)],
			["Alcohol", formatCAD(reportData.alcoholAmount)],
			["Food", formatCAD(reportData.foodAmount)],
			["Non Alcoholic Drinks", formatCAD(reportData.nonAlcoholicDrinksAmount)],
			["Other", formatCAD(reportData.otherAmountSold)],
			["Discount Amount", formatCAD(reportData.discountAmount)],
			["Gift Card Amount", formatCAD(reportData.giftcardAmount)],
			["Tips Earned", formatCAD(reportData.tips)],
			["Cash Amount", formatCAD(reportData.cashAmount)],
			["Card Amount", formatCAD(reportData.cardAmount)],
			["Revenue", formatCAD(reportData.amountPaid)],
			["Cost of Goods Sold", formatCAD(reportData.cogs)],
			["Profit", formatCAD(reportData.amountPaid - reportData.cogs)],
			[],
			["Item", "Quantity", "Revenue", "COGS"],
			...getSortedItems().map((item) => [
				item.name,
				item.quantity,
				formatCAD(item.revenue || 0),
				formatCAD(item.cogs || 0),
			]),
		];

		const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
		const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
		link.href = url;
		link.download = `sales-report-${stamp}.csv`;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		URL.revokeObjectURL(url);
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

		// Only set state here -- the [startDate, endDate] effect below is what
		// actually fetches. Calling getReport from both places was firing the
		// report request twice per click.
		setStartDate(startStr);
		setEndDate(endStr);
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
		<Modal open={open} onClose={onClose} aria-labelledby="sales-report-title" style={{ margin: 0 }}>
			<Box sx={modalStyle}>
				<Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
					<Typography id="txn-progress-title" variant="h6" component="h2">
						Sales Report
					</Typography>
					<Button
						size="small"
						variant="outlined"
						onClick={exportCsv}
						disabled={!reportData}
					>
						Export CSV
					</Button>
				</Box>
				<Box sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap" }}>
					<Button size="small" variant="outlined" onClick={() => handleQuickSelect("12hours")}>
						Last 12 Hours
					</Button>
					<Button size="small" variant="outlined" onClick={() => handleQuickSelect("24hours")}>
						Last 24 Hours
					</Button>
					<Button size="small" variant="outlined" onClick={() => handleQuickSelect("week")}>
						Last Week
					</Button>
					<Button size="small" variant="outlined" onClick={() => handleQuickSelect("alltime")}>
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
							<Typography id="txn-progress-desc">Please wait while the report is generated...</Typography>
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
											<Typography>Sale Volume:</Typography>
											<Typography>{formatCAD(reportData.totalSales)}</Typography>
										</Box>
										<hr />
										<Box
											sx={{
												display: "flex",
												justifyContent: "space-between",
											}}
										>
											<Typography>Alcohol:</Typography>
											<Typography>{formatCAD(reportData.alcoholAmount)}</Typography>
										</Box>
										<Box
											sx={{
												display: "flex",
												justifyContent: "space-between",
											}}
										>
											<Typography>Food:</Typography>
											<Typography>{formatCAD(reportData.foodAmount)}</Typography>
										</Box>
										<Box
											sx={{
												display: "flex",
												justifyContent: "space-between",
											}}
										>
											<Typography>Non Alcoholic Drinks:</Typography>
											<Typography>{formatCAD(reportData.nonAlcoholicDrinksAmount)}</Typography>
										</Box>
										<Box
											sx={{
												display: "flex",
												justifyContent: "space-between",
											}}
										>
											<Typography>Other:</Typography>
											<Typography>{formatCAD(reportData.otherAmountSold)}</Typography>
										</Box>

										<hr />
										<Box
											sx={{
												display: "flex",
												justifyContent: "space-between",
											}}
										>
											<Typography>Discount Amount:</Typography>
											<Typography>{formatCAD(reportData.discountAmount)}</Typography>
										</Box>
										<Box
											sx={{
												display: "flex",
												justifyContent: "space-between",
											}}
										>
											<Typography>Gift Card Amount:</Typography>
											<Typography>{formatCAD(reportData.giftcardAmount)}</Typography>
										</Box>
										<Box
											sx={{
												display: "flex",
												justifyContent: "space-between",
											}}
										>
											<Typography>Tips Earned:</Typography>
											<Typography>{formatCAD(reportData.tips)}</Typography>
										</Box>
										<hr />
										<Box
											sx={{
												display: "flex",
												justifyContent: "space-between",
											}}
										>
											<Typography>Cash Amount:</Typography>
											<Typography>{formatCAD(reportData.cashAmount)}</Typography>
										</Box>
										<Box
											sx={{
												display: "flex",
												justifyContent: "space-between",
											}}
										>
											<Typography>Card Amount:</Typography>
											<Typography>{formatCAD(reportData.cardAmount)}</Typography>
										</Box>
										<hr />
										<Box
											sx={{
												display: "flex",
												justifyContent: "space-between",
											}}
										>
											<Typography>Revenue:</Typography>
											<Typography>{formatCAD(reportData.amountPaid)}</Typography>
										</Box>
										<Box
											sx={{
												display: "flex",
												justifyContent: "space-between",
											}}
										>
											<Typography>Cost of Goods Sold:</Typography>
											<Typography>{formatCAD(reportData.cogs)}</Typography>
										</Box>
										<Box
											sx={{
												display: "flex",
												justifyContent: "space-between",
											}}
										>
											<Typography>Profit:</Typography>
											<Typography>
												{formatCAD(reportData.amountPaid - reportData.cogs)}
											</Typography>
										</Box>
									</Box>
									<hr />
									<Typography variant="h6">Items Sold</Typography>
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
															active={orderBy === "name"}
															direction={orderBy === "name" ? order : "asc"}
															onClick={() => handleSort("name")}
														>
															Item
														</TableSortLabel>
													</TableCell>
													<TableCell align="right">
														<TableSortLabel
															active={orderBy === "quantity"}
															direction={orderBy === "quantity" ? order : "asc"}
															onClick={() => handleSort("quantity")}
														>
															Quantity
														</TableSortLabel>
													</TableCell>
													<TableCell align="right">
														<TableSortLabel
															active={orderBy === "revenue"}
															direction={orderBy === "revenue" ? order : "asc"}
															onClick={() => handleSort("revenue")}
														>
															Revenue
														</TableSortLabel>
													</TableCell>
													<TableCell align="right">
														<TableSortLabel
															active={orderBy === "cogs"}
															direction={orderBy === "cogs" ? order : "asc"}
															onClick={() => handleSort("cogs")}
														>
															COGS
														</TableSortLabel>
													</TableCell>
												</TableRow>
											</TableHead>
											<TableBody>
												{getSortedItems().map((item, index) => (
													<TableRow key={index}>
														<TableCell>{item.name}</TableCell>
														<TableCell align="right">{item.quantity}</TableCell>
														<TableCell align="right">
															{formatCAD(item.revenue || 0)}
														</TableCell>
														<TableCell align="right">{formatCAD(item.cogs || 0)}</TableCell>
													</TableRow>
												))}
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
