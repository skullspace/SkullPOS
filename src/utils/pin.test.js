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

	test("a network/transport error (flaky connection, function unreachable) propagates instead of being swallowed as a wrong PIN", async () => {
		const functions = {
			createExecution: jest.fn().mockRejectedValue(new Error("Failed to fetch")),
		};

		await expect(verifyPin({ functions, pin: "1234" })).rejects.toThrow("Failed to fetch");
	});

	test("a malformed (non-JSON) response body propagates a parse error rather than a false wrong-PIN result", async () => {
		const functions = {
			createExecution: jest.fn().mockResolvedValue({ responseBody: "not valid json" }),
		};

		await expect(verifyPin({ functions, pin: "1234" })).rejects.toThrow();
	});
});

describe("pin mode storage", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	test("returns null when nothing has been set", () => {
		expect(getPinMode()).toBeNull();
	});

	test("round-trips a label through set/get, defaulting selfCheckout and bartenderId", () => {
		setPinMode("Alice");
		expect(getPinMode()).toEqual({ label: "Alice", selfCheckout: false, bartenderId: null });
	});

	test("stores a null label when none is given", () => {
		setPinMode();
		expect(getPinMode()).toEqual({ label: null, selfCheckout: false, bartenderId: null });
	});

	test("round-trips selfCheckout:true for a kiosk PIN", () => {
		setPinMode("Self-Checkout Kiosk 1", true);
		expect(getPinMode()).toEqual({ label: "Self-Checkout Kiosk 1", selfCheckout: true, bartenderId: null });
	});

	test("round-trips a bartenderId for a bartender's own pin", () => {
		setPinMode("Alex", false, "bt1");
		expect(getPinMode()).toEqual({ label: "Alex", selfCheckout: false, bartenderId: "bt1" });
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
		expect(getPinMode()).toEqual({ label: "Self-Checkout Kiosk 1", selfCheckout: true, bartenderId: null });
	});
});
