/**
 * Determines whether alcohol should currently be shown on the staff POS's own selling grid,
 * based on the active event's sellsAlcohol flag and its bar window.
 *
 * The window can arrive in either of two shapes, and this reads BOTH:
 *
 *   barOpensAt / barClosesAt -- full instants (ISO-8601 datetimes, e.g.
 *     "2026-06-05T23:00:00.000Z"). Preferred. Nothing here has to compose a date with a wall
 *     clock, guess a timezone, or special-case a close time that lands after midnight: the
 *     comparison is two numbers.
 *   barOpenTime / barCloseTime -- the legacy "HH:mm" wall-clock strings ("18:00"/"02:00"),
 *     interpreted in the device's own local time, with a close at or before the open meaning
 *     the window runs overnight.
 *
 * The fallback is not decoration. The new attributes are being added to Events in the same pass
 * that this ships, backfilled separately, and every component deploys independently -- so a row
 * that has not been backfilled yet, or a Ticketing-ActiveEvent build that predates the new
 * projection, must still open the bar exactly as it does today.
 *
 * No active event, sellsAlcohol:false, or a missing/malformed window in BOTH shapes all fail
 * closed (alcohol hidden) -- the same safe default the self-checkout kiosk's own permanent
 * exclusion already uses, just event-driven here instead of unconditional.
 */
export function isWithinBarHours(event, now = new Date()) {
	if (!event || !event.sellsAlcohol) return false;

	const window = instantWindow(event);
	if (window) {
		const nowMs = toMillis(now);
		if (nowMs === null) return false;
		return nowMs >= window.opensAt && nowMs < window.closesAt;
	}

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

/**
 * The instant pair, or null to mean "use the legacy strings".
 *
 * Falls back rather than failing closed in the two cases where the new fields are present but
 * cannot describe a real interval -- unparseable, or closing at/before opening. A window that
 * runs backwards is evidence of a bad write upstream (an 02:00 close that did not get the
 * following day attached, say), and the legacy strings on the same row still describe the
 * night correctly. Failing closed on it instead would blank every alcohol item for a whole
 * event, which is precisely the outcome the fallback exists to prevent.
 */
function instantWindow(event) {
	const opensAt = parseInstant(event.barOpensAt);
	const closesAt = parseInstant(event.barClosesAt);
	if (opensAt === null || closesAt === null) return null;
	if (closesAt <= opensAt) return null;
	return { opensAt, closesAt };
}

/**
 * An ISO-8601 datetime: a date AND a time, offset optional (Appwrite always sends one; a bare
 * local datetime is read in the device's own zone, which is the venue's).
 *
 * Deliberately strict, and specifically stricter than Date.parse, which is the trap here:
 * `new Date("1800")` is not an invalid date, it is the YEAR 1800 -- i.e. a bar that closed two
 * centuries ago. The legacy wall-clock strings must never be mistaken for instants, so a value
 * without a date part is not one.
 */
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/i;

export function parseInstant(value) {
	if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	if (!ISO_DATETIME.test(trimmed)) return null;
	const ms = Date.parse(trimmed);
	return Number.isFinite(ms) ? ms : null;
}

function toMillis(now) {
	if (now instanceof Date) return Number.isFinite(now.getTime()) ? now.getTime() : null;
	return parseInstant(now);
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
