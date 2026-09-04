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
	Menu,
} from "@mui/material";
import { FormControl, MenuItem } from "@mui/material";
import HamburgerMenuIcon from "@mui/icons-material/Menu";
import { formatCAD } from "../../utils/format";
import CartItem from "./cartItem";
import PaymentMethodButtons from "../common/Buttons/PaymentMethodButtons";
import CheckoutButton from "../common/Buttons/CheckoutButton";
import GiftcardDisplay from "../common/Display/GiftcardDisplay";

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
	setOpenSalesReport,
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

	// control for menu open close
	const [menuAnchorEl, setMenuAnchorEl] = useState(null);
	const menuOpen = Boolean(menuAnchorEl);
	const [terminalMenuAnchorEl, setTerminalMenuAnchorEl] = useState(null);
	const terminalMenuOpen = Boolean(terminalMenuAnchorEl);

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
				<>
					<Box
						sx={{
							display: "flex",
							justifyContent: "flex-start",
							mb: 1,
						}}
					>
						<IconButton
							sx={{ ml: "auto", position: "absolute", right: 0 }}
							aria-controls={
								menuOpen ? "terminal-menu" : undefined
							}
							aria-haspopup="true"
							aria-expanded={menuOpen ? "true" : undefined}
							onClick={(e) => setMenuAnchorEl(e.currentTarget)}
						>
							<HamburgerMenuIcon />
						</IconButton>
						<Menu
							id="terminal-menu"
							anchorEl={menuAnchorEl}
							open={menuOpen}
							onClose={() => setMenuAnchorEl(null)}
							MenuListProps={{
								"aria-labelledby": "terminal-button",
							}}
						>
							<MenuItem
								onClick={(e) =>
									setTerminalMenuAnchorEl(e.currentTarget)
								}
							>
								Select Terminal
							</MenuItem>
							<MenuItem onClick={openManual}>Manual UPC</MenuItem>
							<MenuItem
								onClick={() => {
									window.document.documentElement.requestFullscreen();
								}}
							>
								Fullscreen
							</MenuItem>
							<MenuItem onClick={() => setOpenSalesReport(true)}>
								Sales Report
							</MenuItem>
						</Menu>
						<Menu
							id="terminal-submenu"
							anchorEl={terminalMenuAnchorEl}
							open={terminalMenuOpen}
							onClose={() => setTerminalMenuAnchorEl(null)}
							anchorOrigin={{
								vertical: "top",
								horizontal: "right",
							}}
							transformOrigin={{
								vertical: "top",
								horizontal: "left",
							}}
						>
							{terminals.map((terminal) => (
								<MenuItem
									key={terminal.id}
									selected={terminal === selectedTerminal}
									onClick={() => {
										setSelectedTerminal(terminal);
										setTerminalMenuAnchorEl(null);
										setMenuAnchorEl(null);
									}}
								>
									{terminal.label}
								</MenuItem>
							))}
						</Menu>
					</Box>
				</>

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
				<Box sx={{ mt: 2 }}>
					<GiftcardDisplay
						giftcard={giftcard}
						onClear={onClearGiftcard}
						isProcessing={!!transactionInProgress}
					/>
					{(() => {
						return <h3>Subtotal: {formatCAD(total)}</h3>;
					})()}
				</Box>
				<PaymentMethodButtons
					currentMethod={paymentMethod}
					onMethodChange={setPaymentMethod}
					isTerminalReady={terminalReady}
					isMemberDiscountApplied={member_discount_applied}
					onToggleMemberDiscount={applyMemberDiscount}
					isProcessing={!!transactionInProgress}
				/>

				<CheckoutButton
					cartItemCount={cart.length}
					isTerminalReady={terminalReady}
					paymentMethod={paymentMethod}
					onCheckout={checkout}
					onClearCart={clearCart}
					isProcessing={!!transactionInProgress}
				/>
			</Box>
		</Box>
	);
};

export default Cart;
