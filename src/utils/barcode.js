/**
 * barcode.js - Barcode scanning and processing logic
 * 
 * Handles barcode input from scanners or manual entry:
 * - Identifies product UPCs and adds items to cart
 * - Detects giftcard codes and initiates giftcard flow
 * - Displays user feedback via alerts
 * 
 * Giftcard detection:
 * - Barcodes starting with "75855" are treated as giftcard codes
 * - Items with UPC matching barcode are added to cart
 */

/**
 * Factory function that creates a barcode processor
 * 
 * @param {Object} deps - Dependencies object
 * @param {Function} deps.getItems - Function returning current items list
 * @param {Function} deps.addItemToCart - Function to add item to cart
 * @param {Function} deps.setStripeAlert - Function to show user alerts
 * @param {Function} deps.handleGiftcard - Function to process giftcard codes
 * @returns {Function} Barcode processor function
 * 
 * @example
 * const processBarcode = createProcessBarcode({
 *   getItems: () => items,
 *   addItemToCart: (itemId) => addItem(itemId),
 *   setStripeAlert: showAlert,
 *   handleGiftcard: processGiftcardCode
 * });
 * processBarcode("0123456789"); // Process UPC
 * processBarcode("75855123456"); // Process giftcard
 */
export default function createProcessBarcode({
	getItems,
	addItemToCart,
	setStripeAlert,
	handleGiftcard,
}) {
	/**
	 * Process a barcode and take appropriate action
	 * 
	 * @param {string} code - Barcode or UPC code to process
	 */
	return function processBarcode(code) {
		if (!code) return;

		// Check if code is a giftcard (starts with 75855 prefix)
		try {
			if (typeof code === "string" && code.startsWith("75855")) {
				// Handle giftcard code
				if (typeof handleGiftcard === "function") {
					try {
						handleGiftcard(code);
					} catch (e) {
						if (typeof setStripeAlert === "function") {
							setStripeAlert({
								active: true,
								message: "Error processing giftcard",
								type: "error",
							});
						}
					}
				}
				return;
			}
		} catch (e) {
			// Defensive: if code isn't a string for some reason, just continue
		}

		// Look up item by UPC/barcode
		const items = typeof getItems === "function" ? getItems() : [];

		const found = items.find((i) => {
			const upc = i && i.UPC;
			if (!upc) return false;
			
			// Support both array and string UPC fields
			if (Array.isArray(upc)) return upc.includes(code);
			if (typeof upc === "string")
				return upc === code || upc.includes(code);
			return false;
		});

		if (found) {
			// Item found - show success message
			// Note: Item is not auto-added (line 45 is commented out)
			// Manual button click is required to add to cart
			if (typeof setStripeAlert === "function") {
				setStripeAlert({
					active: true,
					message: `Scanned: ${found.name}`,
					type: "success",
				});
			}
		} else {
			// Item not found - show error
			if (typeof setStripeAlert === "function") {
				setStripeAlert({
					active: true,
					message: `Barcode not found: ${code}`,
					type: "error",
				});
			}
		}
	};
}
