// Pure utility functions for manipulating the cart array.
// These functions do not mutate their inputs and return a new cart array or state object.

export function addItemToCart(cart, items, itemId) {
	const item = items.find((it) => it.$id === itemId);
	if (!item) return cart.slice();

	const existing = cart.find((c) => c.$id === itemId);
	if (existing) {
		return cart.map((c) =>
			c.$id === itemId ? { ...c, quantity: c.quantity + 1 } : c
		);
	}

	return [...cart, { ...item, quantity: 1 }];
}

export function removeItemFromCart(cart, itemId, all = false) {
	const existing = cart.find((c) => c.$id === itemId);
	if (!existing) return cart.slice();

	if (existing.quantity > 1 && !all) {
		return cart.map((c) =>
			c.$id === itemId ? { ...c, quantity: c.quantity - 1 } : c
		);
	}

	return cart.filter((c) => c.$id !== itemId);
}

export function clearCartState() {
	return {
		member_discount_applied: false,
		discount: 0,
		cart: [],
	};
}
