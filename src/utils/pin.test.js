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
		sessionStorage.clear();
	});

	test("returns null when nothing has been set", () => {
		expect(getPinMode()).toBeNull();
	});

	test("round-trips a label through set/get", () => {
		setPinMode("Alice");
		expect(getPinMode()).toEqual({ label: "Alice" });
	});

	test("stores a null label when none is given", () => {
		setPinMode();
		expect(getPinMode()).toEqual({ label: null });
	});

	test("clearPinMode removes the stored flag", () => {
		setPinMode("Alice");
		clearPinMode();
		expect(getPinMode()).toBeNull();
	});

	test("getPinMode fails safe (null) on corrupted storage instead of throwing", () => {
		sessionStorage.setItem("skullpos_pin_mode", "{not valid json");
		expect(getPinMode()).toBeNull();
	});
});
