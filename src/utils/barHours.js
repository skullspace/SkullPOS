/**
 * Determines whether alcohol should currently be shown on the staff POS's own selling grid,
 * based on the active event's sellsAlcohol flag and its bar window.
 *
 * The window is a pair of full instants -- barOpensAt / barClosesAt, ISO-8601 datetimes such as
 * "2026-06-05T23:00:00.000Z". Nothing here composes a date with a wall clock, guesses a
 * timezone, or special-cases a close time that lands after midnight: the comparison is two
 * numbers.
 *
 * This also used to read the legacy barOpenTime / barCloseTime "HH:mm" strings, interpreted in
 * the device's own local time, and fall back to them whenever the instants were absent or
 * unusable. That fallback is gone. It existed to cover a half-backfilled Events collection
 * while the instants were being added and every component deployed independently -- a state the
 * collection is no longer in, since all three live rows carry both instants. The attributes it
 * read are being deleted from the schema, and a column that no longer exists cannot rescue
 * anything; leaving the parser here would only mean the register kept asking for fields the
 * server has stopped sending. Readers stop reading BEFORE the schema drops, which is why this
 * goes first.
 *
 * Removing it moves exactly one case, and it moves it in the safe direction: a sellsAlcohol
 * event whose instants are missing, unparseable or inverted used to keep selling on its wall
 * clocks, and now hides alcohol. There is no other direction available once there is nothing
 * left to fall back to -- and it is not silent, because resolveAlcoholGate in pos.js raises the
 * "isn't reporting bar hours" banner for an event that reaches the till without the alcohol
 * fields on it.
 *
 * No active event, sellsAlcohol:false, or a missing/malformed window all fail closed (alcohol
 * hidden) -- the same safe default the self-checkout kiosk's own permanent exclusion already
 * uses, just event-driven here instead of unconditional.
 */
export function isWithinBarHours(event, now = new Date()) {
	if (!event || !event.sellsAlcohol) return false;

	const window = instantWindow(event);
	if (!window) return false;

	const nowMs = toMillis(now);
	if (nowMs === null) return false;
	return nowMs >= window.opensAt && nowMs < window.closesAt;
}

/**
 * The instant pair, or null when the row does not describe an interval anyone can sell inside.
 *
 * A window that closes at or before it opens is evidence of a bad write upstream -- an 02:00
 * close that never got the following day attached, say. While the legacy strings existed this
 * returned null to mean "use them instead", on the grounds that the wall clocks on the same row
 * still described the night correctly and blanking a whole event's alcohol over a bad backfill
 * was the worse outcome. With those strings gone the inverted pair is the only window there is,
 * so it is a "don't know" -- and a "don't know" hides alcohol.
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
 * centuries ago. Nothing in the register parses bare wall clocks any more, but that makes this
 * MORE load-bearing rather than less: a stale Ticketing-ActiveEvent build or a hand-corrected
 * row that puts an "HH:mm"-shaped value into barOpensAt has to fail closed here, not become a
 * window two centuries wide that swallows every `now` the till will ever ask about.
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
