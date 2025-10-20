import React from "react";
import { Box } from "@mui/material";
import Item from "./item";
const Category = ({ category, items, onAdd, disableItem }) => {
	const categoryItems = items.filter(
		(item) => item.categories && item.categories.$id === category.$id
	);

	return (
		<Box key={category.$id} sx={{ mb: 2, mx: 2.5, fontSize: ".75em" }}>
			<h2>{category.name}</h2>
			<Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
				{categoryItems.map((item) => (
					<Item
						key={item.$id}
						item={item}
						onAdd={onAdd}
						disableItem={disableItem}
					/>
				))}
			</Box>
		</Box>
	);
};

export default Category;
