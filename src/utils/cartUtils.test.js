import { addItemToCart, removeItemFromCart, clearCartState } from "./cartUtils";

const AVAILABLE_ITEMS = [
	{ $id: "beer", name: "Beer", price: 700 },
	{ $id: "burger", name: "Burger", price: 1200 },
];

describe("addItemToCart", () => {
	test("adds a new item with quantity 1", () => {
		const cart = addItemToCart([], AVAILABLE_ITEMS, "beer");
		expect(cart).toEqual([{ $id: "beer", name: "Beer", price: 700, quantity: 1 }]);
	});

	test("increments quantity when the item is already in the cart", () => {
		const cart = [{ $id: "beer", name: "Beer", price: 700, quantity: 1 }];
		const updated = addItemToCart(cart, AVAILABLE_ITEMS, "beer");
		expect(updated).toEqual([{ $id: "beer", name: "Beer", price: 700, quantity: 2 }]);
	});

	test("does not mutate the original cart array", () => {
		const cart = [{ $id: "beer", name: "Beer", price: 700, quantity: 1 }];
		addItemToCart(cart, AVAILABLE_ITEMS, "beer");
		expect(cart[0].quantity).toBe(1);
	});

	test("returns an unchanged copy when the item id doesn't exist in available items", () => {
		const cart = [{ $id: "beer", name: "Beer", price: 700, quantity: 1 }];
		const updated = addItemToCart(cart, AVAILABLE_ITEMS, "nonexistent");
		expect(updated).toEqual(cart);
		expect(updated).not.toBe(cart); // still a new array (slice)
	});
});

describe("removeItemFromCart", () => {
	test("decrements quantity by 1 when more than one remains", () => {
		const cart = [{ $id: "beer", name: "Beer", price: 700, quantity: 3 }];
		const updated = removeItemFromCart(cart, "beer");
		expect(updated).toEqual([{ $id: "beer", name: "Beer", price: 700, quantity: 2 }]);
	});

	test("removes the item entirely once quantity would drop to 0", () => {
		const cart = [{ $id: "beer", name: "Beer", price: 700, quantity: 1 }];
		const updated = removeItemFromCart(cart, "beer");
		expect(updated).toEqual([]);
	});

	test("removes the item entirely when all=true, regardless of quantity", () => {
		const cart = [{ $id: "beer", name: "Beer", price: 700, quantity: 5 }];
		const updated = removeItemFromCart(cart, "beer", true);
		expect(updated).toEqual([]);
	});

	test("is a no-op (safe copy) when the item isn't in the cart", () => {
		const cart = [{ $id: "beer", name: "Beer", price: 700, quantity: 1 }];
		const updated = removeItemFromCart(cart, "burger");
		expect(updated).toEqual(cart);
		expect(updated).not.toBe(cart);
	});
});

describe("clearCartState", () => {
	test("returns a reset cart/discount state", () => {
		expect(clearCartState()).toEqual({ appliedDiscount: null, discount: 0, cart: [] });
	});
});
