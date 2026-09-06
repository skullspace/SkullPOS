import React from "react";
import { Box } from "@mui/material";
import SelfCheckoutItem from "./selfCheckoutItem";

/**
 * A near-copy of components/pos/category.js for the self-checkout kiosk,
 * with one addition: alcohol/age-restricted items and categories are
 * filtered out entirely -- age verification still requires a staffed
 * register, so a customer must never be able to self-checkout them.
 */
const SelfCheckoutCategory = ({ category, items, onAdd, cartQuantities }) => {
	if (category.alcohol) return null;

	const categoryItems = items.filter(
		(item) => item.categories && item.categories === category.$id && item.alcohol !== true,
	);

	// if no items in this category are POS-enabled, don't render the category
	const hasEnabledItems = categoryItems.some((item) => item.enabledPOS !== false);
	if (!hasEnabledItems) return null;

	return (
		<Box key={category.$id} id={`category-${category.$id}`} sx={{ mb: 2, mx: 2.5, fontSize: ".75em", scrollMarginTop: "140px" }}>
			<h2>{category.name}</h2>
			<Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 1 }}>
				{categoryItems.map((item) => (
					<SelfCheckoutItem
						key={item.$id}
						item={item}
						onAdd={onAdd}
						quantityInCart={cartQuantities?.[item.$id] || 0}
					/>
				))}
			</Box>
		</Box>
	);
};

export default SelfCheckoutCategory;
