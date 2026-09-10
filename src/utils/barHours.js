/**
 * Determines whether alcohol should currently be shown on the staff POS's own selling grid,
 * based on the active event's sellsAlcohol flag and barOpenTime/barCloseTime window (set via
 * the admin app's Events screen) -- "HH:mm" strings, e.g. "18:00"/"02:00". Handles a window
 * that crosses midnight (close time earlier than open time means overnight).
 *
 * No active event, sellsAlcohol:false, or a missing/malformed time window all fail closed
 * (alcohol hidden) -- the same safe default the self-checkout kiosk's own permanent exclusion
 * already uses, just event-driven here instead of unconditional.
 */
export function isWithinBarHours(event, now = new Date()) {
	if (!event || !event.sellsAlcohol) return false;

	const openMinutes = parseTimeToMinutes(event.barOpenTime);
	const closeMinutes = parseTimeToMinutes(event.barCloseTime);
	if (openMinutes === null || closeMinutes === null) return false;

	const nowMinutes = now.getHours() * 60 + now.getMinutes();

	if (closeMinutes <= openMinutes) {
		// Overnight window (e.g. 18:00 - 02:00): "within" means at/after open OR before close.
		return nowMinutes >= openMinutes || nowMinutes < closeMinutes;
	}
	return nowMinutes >= openMinutes && nowMinutes < closeMinutes;
}

function parseTimeToMinutes(value) {
	if (typeof value !== "string") return null;
	const match = value.match(/^(\d{1,2}):(\d{2})$/);
	if (!match) return null;
	const hours = parseInt(match[1], 10);
	const minutes = parseInt(match[2], 10);
	if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
	return hours * 60 + minutes;
}
