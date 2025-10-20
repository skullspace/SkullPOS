import React from "react";
import { Button } from "@mui/joy";
import { formatCAD } from "../../utils/format";

const Item = ({ item, onAdd }) => {
    return (
        <Button
            key={item.$id}
            sx={{
                height: "15vh",
                aspectRatio: "1",
                border: "1px solid",
                p: 2,
            }}
            onClick={() => onAdd(item)}
        >
            <h3>{item.name}</h3>
            <p>{formatCAD(item.price)}</p>
        </Button>
    );
};

export default Item;
