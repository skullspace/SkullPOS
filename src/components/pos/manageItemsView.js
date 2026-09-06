/**
 * manageItemsView.js - Lets staff make a catalog item reachable in the
 * app at all.
 *
 * A brand-new pos_items row defaults both enabled_pos and enabled_menu to
 * false, and the register grid (item.js) hides an enabled_pos:false item
 * entirely -- so without this view there was no in-app way to ever flip
 * enabled_pos true for a new item; it required going into the Appwrite
 * console directly. This lists every item regardless of either flag and
 * toggles them server-side via Item-SetEnabled (the client has no direct
 * write access to pos_items).
 */
import React from "react";
import {
	Box,
	Typography,
	Modal,
	Table,
	TableBody,
	TableCell,
	TableContainer,
	TableHead,
	TableRow,
	Paper,
	Switch,
	TextField,
} from "@mui/material";
import { formatCAD } from "../../utils/format";
import { setItemEnabled } from "../../utils/itemVisibility";

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

const ManageItemsView = ({ open, onClose, items, functions, onItemUpdated, setStripeAlert }) => {
	const [search, setSearch] = React.useState("");
	const [updatingKey, setUpdatingKey] = React.useState(null);

	const filteredItems = React.useMemo(() => {
		const q = search.trim().toLowerCase();
		const list = q ? items.filter((item) => item.name?.toLowerCase().includes(q)) : items;
		return [...list].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
	}, [items, search]);

	const toggle = async (item, field, enabled) => {
		const key = `${item.$id}:${field}`;
		setUpdatingKey(key);
		try {
			const result = await setItemEnabled({ functions, itemId: item.$id, enabled, field });
			if (!result.ok) throw new Error(result.error || "Failed to update item");
			onItemUpdated && onItemUpdated();
		} catch (err) {
			console.error("Failed to update item visibility:", err);
			setStripeAlert && setStripeAlert({ active: true, message: err.message || "Failed to update item", type: "error" });
		} finally {
			setUpdatingKey(null);
		}
	};

	return (
		<Modal open={open} onClose={onClose} aria-labelledby="manage-items-title" style={{ margin: 0 }}>
			<Box sx={modalStyle}>
				<Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
					<Typography id="manage-items-title" variant="h6" component="h2">
						Manage Items
					</Typography>
				</Box>

				<TextField
					fullWidth
					size="small"
					placeholder="Search items..."
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					sx={{ mb: 2 }}
				/>

				<TableContainer component={Paper} sx={{ maxHeight: "60vh" }}>
					<Table stickyHeader size="small">
						<TableHead>
							<TableRow>
								<TableCell>Name</TableCell>
								<TableCell align="right">Price</TableCell>
								<TableCell align="center">At Register</TableCell>
								<TableCell align="center">On Customer Menu</TableCell>
							</TableRow>
						</TableHead>
						<TableBody>
							{filteredItems.length === 0 ? (
								<TableRow>
									<TableCell colSpan={4}>
										<Typography sx={{ p: 2 }}>No items match.</Typography>
									</TableCell>
								</TableRow>
							) : (
								filteredItems.map((item) => (
									<TableRow key={item.$id} hover>
										<TableCell>{item.name}</TableCell>
										<TableCell align="right">{formatCAD(item.price)}</TableCell>
										<TableCell align="center">
											<Switch
												checked={!!item.enabledPOS}
												disabled={updatingKey === `${item.$id}:enabled_pos`}
												onChange={(e) => toggle(item, "enabled_pos", e.target.checked)}
											/>
										</TableCell>
										<TableCell align="center">
											<Switch
												checked={!!item.enabled_menu}
												disabled={updatingKey === `${item.$id}:enabled_menu`}
												onChange={(e) => toggle(item, "enabled_menu", e.target.checked)}
											/>
										</TableCell>
									</TableRow>
								))
							)}
						</TableBody>
					</Table>
				</TableContainer>
			</Box>
		</Modal>
	);
};

export default ManageItemsView;
