/**
 * pin.js - Quick-access PIN mode for cashiers who shouldn't need a full
 * email/password login. A verified PIN grants an anonymous session
 * restricted to selling (no refunds, sales reports capped to 24 hours) --
 * see App.js's RequireAuth and the restrictions applied in salesReport.js /
 * transactionsView.js.
 */

export const VERIFY_PIN_FUNCTION_ID = "6a9c4acd49bc458907e7";

const PIN_MODE_STORAGE_KEY = "skullpos_pin_mode";

/**
 * Calls the Verify-Pin Appwrite Function.
 *
 * @param {Object} params
 * @param {Functions} params.functions - Appwrite Functions client
 * @param {string} params.pin
 * @returns {Promise<{ok: boolean, label?: string}>}
 */
export async function verifyPin({ functions, pin }) {
	const response = await functions.createExecution({
		functionId: VERIFY_PIN_FUNCTION_ID,
		body: JSON.stringify({ pin }),
	});
	return JSON.parse(response.responseBody);
}

/**
 * Reads the current pin-mode flag from sessionStorage (per-tab, cleared on
 * browser close and on logout).
 *
 * @returns {{label: string|null}|null}
 */
export function getPinMode() {
	try {
		const raw = sessionStorage.getItem(PIN_MODE_STORAGE_KEY);
		return raw ? JSON.parse(raw) : null;
	} catch (err) {
		return null;
	}
}

export function setPinMode(label) {
	try {
		sessionStorage.setItem(PIN_MODE_STORAGE_KEY, JSON.stringify({ label: label || null }));
	} catch (err) {
		// sessionStorage unavailable (e.g. private browsing) -- pin mode just
		// won't persist across a reload, not worth surfacing to the cashier
	}
}

export function clearPinMode() {
	try {
		sessionStorage.removeItem(PIN_MODE_STORAGE_KEY);
	} catch (err) {}
}
