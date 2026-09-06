import React from "react";
import { Box, Button, Chip, Typography } from "@mui/material";
import { formatCAD } from "../../utils/format";

/**
 * A near-copy of components/pos/item.js for the self-checkout kiosk --
 * deliberately NOT the same component, because item.js's long-press timer
 * (staff "86 this item" gesture) must never run here: a customer's finger
 * lingering on a tile for half a second must never gray it out mid-order.
 * Everything else (click-to-add, styling) is identical.
 */
const SelfCheckoutItem = ({ item, onAdd, quantityInCart = 0 }) => {
	if (item && item.enabledPOS === false) return null;

	const bgUrl = item && item.image ? item.image : "/logo192.png";

	return (
		<Button
			key={item.$id}
			onClick={() => onAdd(item.$id)}
			variant="contained"
			color="primary"
			sx={{
				width: "100%",
				aspectRatio: "1",
				borderRadius: "10px",
				p: 1.25,
				textTransform: "none",
				display: "flex",
				flexDirection: "column",
				justifyContent: "space-between",
				alignItems: "stretch",
				overflow: "hidden",
				gap: 0.2,
				boxShadow: (theme) => theme?.shadows?.[1] ?? "0 2px 6px rgba(255, 255, 255, 0.12)",
				transition: "transform 120ms ease, box-shadow 120ms ease",
				position: "relative",
				"&::before": {
					content: '""',
					position: "absolute",
					inset: 0,
					backgroundImage: bgUrl ? `url(${bgUrl})` : "none",
					backgroundSize: "cover",
					backgroundPosition: "center",
					backgroundRepeat: "no-repeat",
					filter: "blur(1px) saturate(0.98)",
					transform: "scale(1)",
					zIndex: 0,
					transition: "transform 180ms ease, filter 180ms ease",
				},
				"&:hover::before": {
					transform: "scale(1.2)",
				},
				"&::after": {
					content: '""',
					position: "absolute",
					inset: 0,
					background: "rgba(0,0,0,0.45)",
					zIndex: 1,
				},
				"& > .itemContent": {
					position: "relative",
					zIndex: 2,
				},
			}}
		>
			{quantityInCart > 0 && (
				<Box
					sx={{
						position: "absolute",
						top: 6,
						right: 6,
						zIndex: 3,
						minWidth: 22,
						height: 22,
						borderRadius: "11px",
						px: 0.75,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						fontSize: "0.85rem",
						fontWeight: 700,
						color: "primary.contrastText",
						backgroundColor: "secondary.main",
						boxShadow: 2,
					}}
				>
					{quantityInCart}
				</Box>
			)}
			<Box className="itemContent" sx={{ display: "flex", alignItems: "flex-start", minHeight: 0 }}>
				<Typography
					variant="h6"
					sx={{
						fontSize: "1.6rem",
						fontWeight: 600,
						lineHeight: 1.05,
						wordBreak: "break-word",
						overflowWrap: "anywhere",
						mb: 0.25,
						textShadow: "0 1px 3px rgba(0,0,0,0.9)",
					}}
				>
					{item.name}
				</Typography>
			</Box>

			<Box
				className="itemContent"
				sx={{ flex: 1, display: "flex", alignItems: "stretch", flexDirection: "column", justifyContent: "flex-end" }}
			>
				<Typography
					variant="body2"
					sx={{
						color: "text.secondary",
						fontSize: "0.8rem",
						lineHeight: 1.12,
						wordBreak: "break-word",
						overflowWrap: "anywhere",
						mb: 0.75,
						textShadow: "0 1px 2px rgba(0,0,0,0.9)",
					}}
				>
					{item.description}
				</Typography>

				<Box sx={{ display: "flex", justifyContent: "flex-end" }}>
					<Chip
						label={formatCAD(item.price)}
						color="default"
						size="small"
						sx={{ fontWeight: 600, height: "24px", fontSize: "1.25rem" }}
					/>
				</Box>
			</Box>
		</Button>
	);
};

export default SelfCheckoutItem;
