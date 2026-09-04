import React from "react";
import { Box } from "@mui/material";
import Item from "./item";
const Category = ({ category, items, onAdd, disableItem, cartQuantities }) => {
	const categoryItems = items.filter(
		(item) => item.categories && item.categories === category.$id
	);

	// if no items in this category are POS-enabled, don't render the category
	const hasEnabledItems = categoryItems.some(
		(item) => item.enabledPOS !== false
	);
	if (!hasEnabledItems) return null;

	return (
		<Box
			key={category.$id}
			id={`category-${category.$id}`}
			sx={{ mb: 2, mx: 2.5, fontSize: ".75em", scrollMarginTop: "140px" }}
		>
			<h2>{category.name}</h2>
			<Box
				sx={{
					display: "grid",
					gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
					gap: 1,
				}}
			>
				{categoryItems.map((item) => (
					<Item
						key={item.$id}
						item={item}
						onAdd={onAdd}
						disableItem={disableItem}
						quantityInCart={cartQuantities?.[item.$id] || 0}
					/>
				))}
			</Box>
		</Box>
	);
};

export default Category;
