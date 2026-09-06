import { verifyPin, getPinMode, setPinMode, clearPinMode } from "./pin";

describe("verifyPin", () => {
	test("posts the pin and returns the parsed result", async () => {
		const functions = {
			createExecution: jest.fn().mockResolvedValue({ responseBody: JSON.stringify({ ok: true, label: "Alice" }) }),
		};

		const result = await verifyPin({ functions, pin: "1234" });

		expect(result).toEqual({ ok: true, label: "Alice" });
		expect(functions.createExecution).toHaveBeenCalledWith({
			functionId: "6a9c4acd49bc458907e7",
			body: JSON.stringify({ pin: "1234" }),
		});
	});

	test("returns ok:false for a wrong pin", async () => {
		const functions = {
			createExecution: jest.fn().mockResolvedValue({ responseBody: JSON.stringify({ ok: false }) }),
		};

		const result = await verifyPin({ functions, pin: "0000" });

		expect(result).toEqual({ ok: false });
	});
});

describe("pin mode storage", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	test("returns null when nothing has been set", () => {
		expect(getPinMode()).toBeNull();
	});

	test("round-trips a label through set/get, defaulting selfCheckout to false", () => {
		setPinMode("Alice");
		expect(getPinMode()).toEqual({ label: "Alice", selfCheckout: false });
	});

	test("stores a null label when none is given", () => {
		setPinMode();
		expect(getPinMode()).toEqual({ label: null, selfCheckout: false });
	});

	test("round-trips selfCheckout:true for a kiosk PIN", () => {
		setPinMode("Self-Checkout Kiosk 1", true);
		expect(getPinMode()).toEqual({ label: "Self-Checkout Kiosk 1", selfCheckout: true });
	});

	test("clearPinMode removes the stored flag", () => {
		setPinMode("Alice");
		clearPinMode();
		expect(getPinMode()).toBeNull();
	});

	test("getPinMode fails safe (null) on corrupted storage instead of throwing", () => {
		localStorage.setItem("skullpos_pin_mode", "{not valid json");
		expect(getPinMode()).toBeNull();
	});

	test("persists across what would be a browser/tab restart (localStorage, not sessionStorage)", () => {
		setPinMode("Self-Checkout Kiosk 1", true);
		// sessionStorage clearing (simulating a tab close) must not affect it --
		// this is the whole point of using localStorage for kiosk persistence.
		sessionStorage.clear();
		expect(getPinMode()).toEqual({ label: "Self-Checkout Kiosk 1", selfCheckout: true });
	});
});
