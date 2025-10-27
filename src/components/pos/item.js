import React from "react";
import { Box, Button, Chip, Typography } from "@mui/material";
import { formatCAD } from "../../utils/format";

const imgurl = (file) => {
	return `https://api.cloud.shotty.tech/v1/storage/buckets/67ca0bcc002993f0ef2f/files/${file}/view?project=68f2ac7b00002e7563a8`;
};

const Item = ({ item, onAdd, disableItem }) => {
	const longPressTimeout = React.useRef(null);
	const longPressTriggered = React.useRef(false);
	const pointerIdRef = React.useRef(null);
	const LONG_PRESS_MS = 500;
	const [disabled, setDisabled] = React.useState(false);

	React.useEffect(() => {
		if (item.shown === false) {
			setDisabled(true);
		}
	}, [item.shown]);

	const handlePointerDown = (e) => {
		longPressTriggered.current = false;
		try {
			e.currentTarget.setPointerCapture?.(e.pointerId);
			pointerIdRef.current = e.pointerId;
		} catch (_) {}

		longPressTimeout.current = setTimeout(() => {
			longPressTriggered.current = true;
			setDisabled((prev) => {
				const newState = !prev;
				if (disableItem) disableItem(item.$id, !newState);
				return newState;
			});
		}, LONG_PRESS_MS);
	};

	const clearLongPress = (e) => {
		if (longPressTimeout.current) {
			clearTimeout(longPressTimeout.current);
			longPressTimeout.current = null;
		}
		try {
			if (pointerIdRef.current != null) {
				e.currentTarget.releasePointerCapture?.(pointerIdRef.current);
				pointerIdRef.current = null;
			}
		} catch (_) {}
	};

	const bgUrl = item && item.image ? imgurl(item.image) : "/logo192.png";

	const isDisabled = Boolean(item.disabled) || disabled;

	return (
		<Button
			aria-disabled={isDisabled}
			key={item.$id}
			onPointerDown={handlePointerDown}
			onPointerUp={clearLongPress}
			onPointerCancel={clearLongPress}
			onPointerLeave={clearLongPress}
			onClick={(e) => {
				if (longPressTriggered.current) {
					longPressTriggered.current = false;
					e.preventDefault();
					e.stopPropagation();
					return;
				}
				if (isDisabled) {
					e.preventDefault();
					e.stopPropagation();
					return;
				}
				onAdd(item.$id);
			}}
			variant="contained"
			color="primary"
			sx={{
				height: "13vh",
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
				boxShadow: (theme) =>
					theme?.shadows?.[1] ??
					"0 2px 6px rgba(255, 255, 255, 0.12)",
				transition: "transform 120ms ease, box-shadow 120ms ease",
				position: "relative",
				textOutline: "5px solid black",
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
				...(isDisabled
					? {
							opacity: 0.5,
							filter: "grayscale(0.6)",
					  }
					: {}),
			}}
		>
			<Box
				className="itemContent"
				sx={{
					display: "flex",
					alignItems: "flex-start",
					minHeight: 0,
				}}
			>
				<Typography
					level="h6"
					sx={{
						fontSize: "1.6rem",
						fontWeight: 600,
						lineHeight: 1.05,
						wordBreak: "break-word",
						overflowWrap: "anywhere",
						mb: 0.25,
					}}
				>
					{item.name}
				</Typography>
			</Box>

			<Box
				className="itemContent"
				sx={{
					flex: 1,
					display: "flex",
					alignItems: "stretch",
					flexDirection: "column",
					justifyContent: "flex-end",
				}}
			>
				<Typography
					level="body2"
					sx={{
						color: "text.secondary",
						fontSize: "0.8rem",
						lineHeight: 1.12,
						wordBreak: "break-word",
						overflowWrap: "anywhere",
						mb: 0.75,
					}}
				>
					{item.description}
				</Typography>

				<Box sx={{ display: "flex", justifyContent: "flex-end" }}>
					<Chip
						label={formatCAD(item.price)}
						color="neutral"
						size="small"
						sx={{
							fontWeight: 600,
							height: "24px",
							fontSize: "1.25rem",
						}}
					/>
				</Box>
			</Box>
		</Button>
	);
};
export default Item;
