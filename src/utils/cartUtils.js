/**
 * cartUtils.js - Pure utility functions for cart state management
 * 
 * These are pure, immutable functions that operate on cart state without side effects.
 * They create new arrays/objects rather than mutating existing ones, enabling
 * proper React state updates and time-travel debugging.
 */

/**
 * Add item to cart or increment quantity if already present
 * 
 * @param {Array<Object>} cart - Current cart items array
 * @param {Array<Object>} items - Available items from database
 * @param {string} itemId - ID of item to add
 * @returns {Array<Object>} New cart array with item added/incremented
 * 
 * @example
 * // Add new item to cart
 * const newCart = addItemToCart([], availableItems, "item123");
 * 
 * // Increment existing item quantity
 * const updatedCart = addItemToCart(
 *   [{ $id: "item123", name: "Beer", price: 500, quantity: 1 }],
 *   availableItems,
 *   "item123"
 * );
 * // Result: [{ $id: "item123", ..., quantity: 2 }]
 */
export function addItemToCart(cart, items, itemId) {
	const item = items.find((it) => it.$id === itemId);
	if (!item) return cart.slice();

	const existing = cart.find((c) => c.$id === itemId);
	if (existing) {
		// Item already in cart - increment quantity
		return cart.map((c) =>
			c.$id === itemId ? { ...c, quantity: c.quantity + 1 } : c
		);
	}

	// New item - add with quantity 1
	return [...cart, { ...item, quantity: 1 }];
}

/**
 * Remove item from cart or decrement quantity
 * 
 * @param {Array<Object>} cart - Current cart items array
 * @param {string} itemId - ID of item to remove
 * @param {boolean} [all=false] - If true, remove all quantity; if false, decrement by 1
 * @returns {Array<Object>} New cart array with item removed/decremented
 * 
 * @example
 * // Decrement item quantity
 * const cart = [
 *   { $id: "item123", name: "Beer", price: 500, quantity: 3 }
 * ];
 * const updated = removeItemFromCart(cart, "item123", false);
 * // Result: [{ $id: "item123", ..., quantity: 2 }]
 * 
 * // Remove all of item (when quantity becomes 0)
 * const final = removeItemFromCart(updated, "item123", true);
 * // Result: [] (item removed from cart)
 */
export function removeItemFromCart(cart, itemId, all = false) {
	const existing = cart.find((c) => c.$id === itemId);
	if (!existing) return cart.slice();

	if (existing.quantity > 1 && !all) {
		// Decrement quantity
		return cart.map((c) =>
			c.$id === itemId ? { ...c, quantity: c.quantity - 1 } : c
		);
	}

	// Remove item entirely
	return cart.filter((c) => c.$id !== itemId);
}

/**
 * Get canonical cleared cart state
 * Used to reset cart to empty state with all discount/payment flags reset
 * 
 * @returns {Object} Reset state object containing empty cart and cleared flags
 */
export function clearCartState() {
	return {
		appliedDiscount: null,
		discount: 0,
		cart: [],
	};
}
