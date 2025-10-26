import React, { useState } from "react";
import {
	Box,
	Button,
	IconButton,
	Dialog,
	DialogTitle,
	DialogContent,
	DialogActions,
	TextField,
} from "@mui/material";
import {
	FormControl,
	InputLabel,
	Select,
	MenuItem,
	Tooltip,
} from "@mui/material";
import CreditCardIcon from "@mui/icons-material/CreditCard";
import MoneyIcon from "@mui/icons-material/AttachMoney";
import CheckoutIcon from "@mui/icons-material/ShoppingCartCheckout";
import DeleteIcon from "@mui/icons-material/Delete";
import { formatCAD } from "../../utils/format";
import CartItem from "./cartItem";

const Cart = ({
	cart,
	member_discount_applied,
	applyMemberDiscount,
	clearCart,
	removeItemFromCart,
	onIncrement,
	onDecrement,
	total,
	terminalReady,
	paymentMethod,
	setPaymentMethod,
	checkout,
	terminals,
	selectedTerminal,
	setSelectedTerminal,
	giftcard,
	onClearGiftcard,
	transactionInProgress,
	onManualUPCEntry,
}) => {
	const [manualOpen, setManualOpen] = useState(false);
	const [manualValue, setManualValue] = useState("");

	const openManual = () => {
		setManualValue("");
		setManualOpen(true);
	};

	const submitManual = () => {
		if (manualValue && onManualUPCEntry)
			onManualUPCEntry(manualValue.trim());
		setManualOpen(false);
		setManualValue("");
	};

	return (
		<Box
			sx={{
				width: "25vw",
				minWidth: 240,
				maxWidth: "30%",
				p: 2,
				display: "flex",
				flexDirection: "column",
				height: "100%",
			}}
		>
			{/* dropdown to select terminal */}
			<FormControl fullWidth>
				{terminals.length > 0 && (
					<>
						<Box
							sx={{
								display: "flex",
								justifyContent: "flex-start",
								mb: 1,
							}}
						>
							<Button
								size="small"
								onClick={openManual}
								sx={{ mr: 1 }}
							>
								Manual UPC
							</Button>
						</Box>
						<br />
						<Select
							value={selectedTerminal}
							onChange={(e) =>
								setSelectedTerminal(e.target.value)
							}
						>
							{terminals.map((terminal) => (
								<MenuItem key={terminal.id} value={terminal}>
									{terminal.label}
								</MenuItem>
							))}
						</Select>
					</>
				)}

				{/* Manual UPC entry dialog */}
				<Dialog open={manualOpen} onClose={() => setManualOpen(false)}>
					<DialogTitle>Enter UPC / Giftcard</DialogTitle>
					<DialogContent>
						<TextField
							autoFocus
							margin="dense"
							label="UPC or Giftcard Code"
							fullWidth
							value={manualValue}
							onChange={(e) => setManualValue(e.target.value)}
						/>
					</DialogContent>
					<DialogActions>
						<Button onClick={() => setManualOpen(false)}>
							Cancel
						</Button>
						<Button onClick={submitManual} disabled={!manualValue}>
							Add
						</Button>
					</DialogActions>
				</Dialog>
			</FormControl>
			<Box sx={{ flex: 1, overflow: "auto" }}>
				{member_discount_applied && (
					<Box
						sx={{
							position: "sticky",
							top: 0,
							background: "background.surface",
							zIndex: 1,
							mb: 0,
							p: 0,
							borderBottom: "1px solid",
						}}
					>
						<p>Member discount applied</p>
					</Box>
				)}
				{cart.length === 0 ? (
					<p>The cart is empty</p>
				) : (
					<Box>
						{cart.map((cartItem) => (
							<CartItem
								key={cartItem.$id}
								cartItem={cartItem}
								onRemove={removeItemFromCart}
								onIncrement={onIncrement}
								onDecrement={onDecrement}
							/>
						))}
					</Box>
				)}
			</Box>

			<Box
				sx={{
					position: "sticky",
					bottom: 0,
					mt: 0,
					background: "background.surface",
					p: 0,
				}}
			>
				{cart.length > 0 && (
					<Box sx={{ mt: 2 }}>
						{giftcard && (
							<Box
								sx={{
									mb: 1,
									display: "flex",
									justifyContent: "space-between",
									alignItems: "center",
								}}
							>
								<div>
									<strong>Giftcard:</strong>{" "}
									{(() => {
										const id = giftcard.$id || "";
										if (id.length <= 8) return id;
										return "****" + id.slice(-8);
									})()}
									<div>
										Balance:{" "}
										{formatCAD(giftcard.balance || 0)}
									</div>
								</div>
								<Button
									size="small"
									onClick={onClearGiftcard}
									disabled={!!transactionInProgress}
								>
									Clear Giftcard
								</Button>
							</Box>
						)}
						{(() => {
							return <h3>Subtotal: {formatCAD(total)}</h3>;
						})()}
					</Box>
				)}
				<Box
					sx={{
						display: "grid",
						gridTemplateColumns: "1fr 1fr 2fr",
						mb: 0.5,
						gap: 0.5,
					}}
				>
					<Button
						loadingIndicator="Loading..."
						loading={!terminalReady}
						startDecorator={<CreditCardIcon fontSize="small" />}
						disabled={terminalReady ? false : true}
						variant={
							paymentMethod === "stripe"
								? "outlined"
								: "contained"
						}
						sx={{ mx: 0.5 }}
						onClick={() => setPaymentMethod("stripe")}
					>
						Card
					</Button>
					<Button
						startDecorator={<MoneyIcon fontSize="small" />}
						variant={
							paymentMethod === "cash" ? "outlined" : "contained"
						}
						sx={{ mx: 0.5 }}
						onClick={() => setPaymentMethod("cash")}
					>
						Cash
					</Button>
					<Button
						startDecorator={<MoneyIcon fontSize="small" />}
						variant={
							member_discount_applied ? "outlined" : "contained"
						}
						sx={{ mx: 0.5 }}
						onClick={() =>
							applyMemberDiscount(!member_discount_applied)
						}
					>
						Member Discount
					</Button>
				</Box>

				<Box
					sx={{
						display: "grid",
						gridTemplateColumns: "3fr 1fr",
						gap: 0.5,
						alignItems: "end",
					}}
				>
					<Box
						sx={{
							height: "100%",
							display: "flex",
							flexDirection: "column",
							justifyContent: "end",
						}}
					>
						{cart.length === 0 ? (
							<Tooltip title="Cart is empty">
								<span>
									<Button
										color="primary"
										variant="contained"
										fullWidth
										sx={{ mt: 0 }}
										onClick={checkout}
										disabled
									>
										<CheckoutIcon
											fontSize="small"
											sx={{ mr: 1 }}
										/>
										Checkout
									</Button>
								</span>
							</Tooltip>
						) : paymentMethod === "stripe" && !terminalReady ? (
							<Tooltip title="Terminal not ready">
								<span>
									<Button
										color="primary"
										variant="contained"
										fullWidth
										sx={{ mt: 0 }}
										onClick={checkout}
										disabled
									>
										<CheckoutIcon
											fontSize="small"
											sx={{ mr: 1 }}
										/>
										Checkout
									</Button>
								</span>
							</Tooltip>
						) : (
							<Button
								color="primary"
								variant="contained"
								fullWidth
								sx={{ mt: 0 }}
								onClick={checkout}
							>
								<CheckoutIcon fontSize="small" sx={{ mr: 1 }} />
								Checkout
							</Button>
						)}
					</Box>

					<IconButton
						variant="contained"
						color="secondary"
						onClick={clearCart}
						aria-label="Clear cart"
						sx={{ mt: 0 }}
					>
						<DeleteIcon fontSize="small" />
					</IconButton>
				</Box>
			</Box>
		</Box>
	);
};

export default Cart;
