export default function createProcessBarcode({
	getItems,
	addItemToCart,
	setStripeAlert,
	handleGiftcard,
}) {
	return function processBarcode(code) {
		if (!code) return;

		// ignore giftcard prefix for now
		try {
			if (typeof code === "string" && code.startsWith("75855")) {
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
			// defensive: if code isn't a string for some reason, just continue
		}

		const items = typeof getItems === "function" ? getItems() : [];

		const found = items.find((i) => {
			const upc = i && i.UPC;
			if (!upc) return false;
			if (Array.isArray(upc)) return upc.includes(code);
			if (typeof upc === "string")
				return upc === code || upc.includes(code);
			return false;
		});

		if (found) {
			if (typeof addItemToCart === "function") addItemToCart(found.$id);
			if (typeof setStripeAlert === "function") {
				setStripeAlert({
					active: true,
					message: `Scanned: ${found.name}`,
					type: "success",
				});
			}
		} else {
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
