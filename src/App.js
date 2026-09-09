/**
 * App.js - Main application component for SkullPOS
 *
 * SkullPOS is a Point of Sale system designed for Skull Space with features including:
 * - User authentication (Google SSO for staff, quick-access PIN for cashiers/kiosks)
 * - Product catalog with categories
 * - Shopping cart with member discounts
 * - Multi-method payment processing (Stripe, Cash, Gift Cards)
 * - Barcode scanning support
 * - Sales reporting and analytics
 *
 * This component handles routing and the two auth guards below. There is
 * no self-registration route -- staff accounts sign in with their
 * Skullspace Google Workspace account (see RequireAuth's domain check
 * below), and non-staff cashiers/kiosks use a PIN instead.
 */

import { useAppwrite } from "./utils/api";
import { clearPinMode, setPinMode } from "./utils/pin";
import { useEffect, useState } from "react";
import { BrowserRouter as Router, Navigate, Route, Routes, useNavigate } from "react-router-dom";

// Component imports
import Login from "./components/login";
import POS from "./components/pos/pos";
import SelfCheckout from "./components/selfCheckout/selfCheckout";

// Three access tiers by Appwrite team membership, checked after Google
// SSO (see RequireAuth below). Mirrors STAFF_TEAM_IDS in
// AppwriteFunctions/functions/Sales-Report and Transactions-List, which
// today treats admin+POS as equally "staff" server-side -- if these
// tiers need to be enforced server-side too (not just hidden in this
// client's UI), those functions' isStaff() checks need the same admin
// vs. POS split.
const ADMIN_TEAM_ID = "68e35aed00144b8cde9d";
const POS_TEAM_IDS = ["68ffce9a0015d2dc0b0d", "68ffcecc0026f78f0af8"];

/**
 * Gate for the /pos route. Renders nothing until the session check
 * resolves -- an unauthenticated visitor should never see even a flash of
 * the POS screen -- then either renders children or redirects to /login.
 *
 * A self-checkout kiosk PIN does NOT satisfy this guard (defense in
 * depth) -- bookmarking/typing /pos from a kiosk session must not open
 * the full staff screen, even though nothing in the kiosk UI itself links
 * there.
 */
function RequireAuth({ children }) {
	const { account, teams, logout, pinMode } = useAppwrite();
	const navigate = useNavigate();
	const [ready, setReady] = useState(false);

	useEffect(() => {
		let cancelled = false;

		account
			.get()
			.then(async (acct) => {
				if (cancelled) return;

				if (acct && acct.email) {
					// Google SSO isn't restricted to the Workspace at the OAuth
					// layer (Appwrite's client SDK doesn't expose Google's `hd`
					// hosted-domain param), so any non-@skullspace.ca Google
					// account that completed the OAuth flow is rejected here,
					// the single choke point every /pos load passes through.
					if (!acct.email.toLowerCase().endsWith("@skullspace.ca")) {
						logout("domain");
						return;
					}

					// Any Skullspace Google account can sign in, but what it
					// lands on depends on team membership: admin gets the
					// full, unrestricted session; POS gets the same
					// restricted "PIN mode" a quick-access cashier PIN gets
					// (24h Sales Report cap, no refunds); no recognized team
					// at all gets self-checkout only, same as a kiosk PIN.
					// teams.list() only ever returns teams this account
					// itself belongs to, so no extra permission is needed
					// beyond the session that already exists.
					let teamIds = [];
					try {
						const result = await teams.list();
						teamIds = (result.teams || []).map((t) => t.$id);
					} catch (err) {
						console.error("Failed to check team membership (treating as no role):", err);
					}

					if (cancelled) return;

					if (teamIds.includes(ADMIN_TEAM_ID)) {
						// A stale PIN-mode flag from an earlier kiosk/PIN session
						// on this same browser (one that ended some way other
						// than the app's own Logout) would otherwise survive
						// into this real staff session and silently restrict it
						// even though this is a genuine, unrestricted login.
						clearPinMode();
						setReady(true);
						return;
					}

					if (teamIds.some((id) => POS_TEAM_IDS.includes(id))) {
						setPinMode(acct.name || acct.email, false);
						setReady(true);
						return;
					}

					// No recognized role -- self-checkout only, same as a
					// kiosk PIN. Not rendering children here (no setReady)
					// mirrors the kiosk-PIN-on-/pos case just below.
					setPinMode(acct.name || acct.email, true);
					navigate("/self-checkout", { replace: true });
					return;
				}

				// An anonymous session is only valid here if it was created
				// through the quick-access PIN flow (loginWithPin sets this
				// flag right before creating the session) AND isn't a
				// self-checkout kiosk PIN (those belong on /self-checkout).
				if (acct && pinMode && !pinMode.selfCheckout) {
					setReady(true);
					return;
				}

				if (acct && pinMode && pinMode.selfCheckout) {
					navigate("/self-checkout", { replace: true });
					return;
				}

				// Session exists but isn't a recognized authenticated state --
				// logout() already redirects to /login itself.
				logout();
			})
			.catch(() => {
				if (!cancelled) navigate("/login", { replace: true });
			});

		return () => {
			cancelled = true;
		};
	}, [account, teams, logout, navigate, pinMode]);

	return ready ? children : null;
}

/**
 * Gate for the /self-checkout route. Only a PIN verified as
 * selfCheckout:true satisfies this -- a staff Google SSO session does
 * NOT (a manager's real login opening the customer-facing kiosk screen
 * would be its own kind of mistake), and neither does an ordinary cashier
 * PIN.
 */
function RequireSelfCheckoutAuth({ children }) {
	const { account, logout, pinMode } = useAppwrite();
	const navigate = useNavigate();
	const [ready, setReady] = useState(false);

	useEffect(() => {
		let cancelled = false;

		account
			.get()
			.then((acct) => {
				if (cancelled) return;

				if (acct && pinMode && pinMode.selfCheckout) {
					setReady(true);
					return;
				}

				if (acct && (acct.email || pinMode)) {
					// A staff or ordinary-cashier session exists, just not one
					// that belongs on this route -- send it to /pos instead of
					// logging it out.
					navigate("/pos", { replace: true });
					return;
				}

				logout();
			})
			.catch(() => {
				if (!cancelled) navigate("/login", { replace: true });
			});

		return () => {
			cancelled = true;
		};
	}, [account, logout, navigate, pinMode]);

	return ready ? children : null;
}

/**
 * Gate for /login. Sends an already-logged-in visitor straight to /pos
 * (or /self-checkout, for a kiosk PIN) instead of showing them the auth
 * form again.
 */
function RedirectIfAuthed({ children }) {
	const { account, pinMode } = useAppwrite();
	const navigate = useNavigate();

	useEffect(() => {
		let cancelled = false;

		account
			.get()
			.then((acct) => {
				if (cancelled || !acct) return;

				if (pinMode && pinMode.selfCheckout) {
					navigate("/self-checkout", { replace: true });
					return;
				}

				if (acct.email || pinMode) {
					navigate("/pos", { replace: true });
				}
			})
			.catch(() => {
				// no session -- this is exactly where an unauthenticated
				// visitor is supposed to land, nothing to do
			});

		return () => {
			cancelled = true;
		};
	}, [account, navigate, pinMode]);

	return children;
}

export default function App() {
	return (
		<Router>
			<Routes>
				<Route path="/" element={<Navigate to="/pos" replace />} />
				<Route
					path="/login"
					element={
						<RedirectIfAuthed>
							<Login />
						</RedirectIfAuthed>
					}
				/>
				<Route
					path="/pos"
					element={
						<RequireAuth>
							<POS />
						</RequireAuth>
					}
				/>
				<Route
					path="/self-checkout"
					element={
						<RequireSelfCheckoutAuth>
							<SelfCheckout />
						</RequireSelfCheckoutAuth>
					}
				/>
				{/* Catches a stale /register bookmark too, now that
				self-registration has been removed. */}
				<Route path="*" element={<Navigate to="/login" replace />} />
			</Routes>
		</Router>
	);
}
