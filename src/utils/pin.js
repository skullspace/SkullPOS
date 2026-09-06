/**
 * pin.js - Quick-access PIN mode for cashiers and self-checkout kiosks who
 * shouldn't need a full email/password login. A verified PIN grants an
 * anonymous session in one of two restricted modes -- see App.js's
 * RequireAuth/RequireSelfCheckoutAuth:
 *   - cashier mode (selfCheckout: false/absent): no refunds, sales reports
 *     capped to 24 hours -- see the restrictions in salesReport.js /
 *     transactionsView.js.
 *   - self-checkout mode (selfCheckout: true): the customer-facing kiosk
 *     screen -- no refunds/history/reporting access at all, card-only
 *     payment. See components/selfCheckout/.
 */

export const VERIFY_PIN_FUNCTION_ID = "6a9c4acd49bc458907e7";

const PIN_MODE_STORAGE_KEY = "skullpos_pin_mode";

/**
 * Calls the Verify-Pin Appwrite Function.
 *
 * @param {Object} params
 * @param {Functions} params.functions - Appwrite Functions client
 * @param {string} params.pin
 * @returns {Promise<{ok: boolean, label?: string, selfCheckout?: boolean}>}
 */
export async function verifyPin({ functions, pin }) {
	const response = await functions.createExecution({
		functionId: VERIFY_PIN_FUNCTION_ID,
		body: JSON.stringify({ pin }),
	});
	return JSON.parse(response.responseBody);
}

/**
 * Reads the current pin-mode flag from localStorage. Unlike a staff
 * cashier's session (also PIN-based), a self-checkout kiosk is a fixed
 * device that isn't meant to ask for its PIN every time its browser
 * restarts or the terminal power-cycles overnight -- so this persists
 * until an explicit "Log out" (clearPinMode), not just until the tab/
 * browser closes.
 *
 * @returns {{label: string|null, selfCheckout: boolean}|null}
 */
export function getPinMode() {
	try {
		const raw = localStorage.getItem(PIN_MODE_STORAGE_KEY);
		return raw ? JSON.parse(raw) : null;
	} catch (err) {
		return null;
	}
}

export function setPinMode(label, selfCheckout) {
	try {
		localStorage.setItem(PIN_MODE_STORAGE_KEY, JSON.stringify({ label: label || null, selfCheckout: !!selfCheckout }));
	} catch (err) {
		// localStorage unavailable (e.g. private browsing) -- pin mode just
		// won't persist across a reload, not worth surfacing to the cashier
	}
}

export function clearPinMode() {
	try {
		localStorage.removeItem(PIN_MODE_STORAGE_KEY);
	} catch (err) {}
}
