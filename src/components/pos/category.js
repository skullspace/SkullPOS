import React from "react";
import { Box } from "@mui/joy";
import Item from "./item";
const Category = ({ category, items, onAdd }) => {
    const categoryItems = items.filter(
        (item) => item.categories && item.categories.$id === category.$id
    );

    return (
        <Box key={category.$id} sx={{ mb: 4 }}>
            <h2>{category.name}</h2>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
                {categoryItems.map((item) => (
                    <Item key={item.$id} item={item} onAdd={onAdd} />
                ))}
            </Box>
        </Box>
    );
};

export default Category;
