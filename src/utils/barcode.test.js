import createProcessBarcode from "./barcode";

function makeDeps(overrides = {}) {
	return {
		getItems: jest.fn().mockReturnValue([
			{ $id: "beer", name: "Beer", UPC: "0123456789" },
			{ $id: "cider", name: "Cider", UPC: ["1111111111", "2222222222"] },
		]),
		addItemToCart: jest.fn(),
		setStripeAlert: jest.fn(),
		handleGiftcard: jest.fn(),
		...overrides,
	};
}

describe("processBarcode", () => {
	test("does nothing for an empty/falsy code", () => {
		const deps = makeDeps();
		createProcessBarcode(deps)("");
		expect(deps.getItems).not.toHaveBeenCalled();
		expect(deps.setStripeAlert).not.toHaveBeenCalled();
	});

	test("routes a giftcard-prefixed code (75855...) to handleGiftcard instead of item lookup", () => {
		const deps = makeDeps();
		createProcessBarcode(deps)("75855123456");
		expect(deps.handleGiftcard).toHaveBeenCalledWith("75855123456");
		expect(deps.getItems).not.toHaveBeenCalled();
	});

	test("shows an error alert if handleGiftcard itself throws", () => {
		const deps = makeDeps({
			handleGiftcard: jest.fn(() => {
				throw new Error("boom");
			}),
		});
		createProcessBarcode(deps)("75855123456");
		expect(deps.setStripeAlert).toHaveBeenCalledWith(
			expect.objectContaining({ active: true, type: "error", message: "Error processing giftcard" }),
		);
	});

	test("matches a string-UPC item exactly and shows a success alert", () => {
		const deps = makeDeps();
		createProcessBarcode(deps)("0123456789");
		expect(deps.setStripeAlert).toHaveBeenCalledWith(
			expect.objectContaining({ active: true, type: "success", message: "Scanned: Beer" }),
		);
	});

	test("matches an array-UPC item (multiple barcodes for one product)", () => {
		const deps = makeDeps();
		createProcessBarcode(deps)("2222222222");
		expect(deps.setStripeAlert).toHaveBeenCalledWith(
			expect.objectContaining({ type: "success", message: "Scanned: Cider" }),
		);
	});

	test("shows an error alert when nothing matches the barcode", () => {
		const deps = makeDeps();
		createProcessBarcode(deps)("9999999999");
		expect(deps.setStripeAlert).toHaveBeenCalledWith(
			expect.objectContaining({ type: "error", message: "Barcode not found: 9999999999" }),
		);
	});

	test("does not add the found item to the cart automatically by default (staff POS)", () => {
		const deps = makeDeps();
		createProcessBarcode(deps)("0123456789");
		expect(deps.addItemToCart).not.toHaveBeenCalled();
	});

	test("autoAddOnScan:true adds the matched item to the cart immediately (self-checkout)", () => {
		const deps = makeDeps();
		createProcessBarcode({ ...deps, autoAddOnScan: true })("0123456789");
		expect(deps.addItemToCart).toHaveBeenCalledWith("beer");
		expect(deps.setStripeAlert).toHaveBeenCalledWith(
			expect.objectContaining({ type: "success", message: "Scanned: Beer" }),
		);
	});

	test("autoAddOnScan:true does not add anything when the barcode doesn't match", () => {
		const deps = makeDeps();
		createProcessBarcode({ ...deps, autoAddOnScan: true })("9999999999");
		expect(deps.addItemToCart).not.toHaveBeenCalled();
	});
});
