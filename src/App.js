/**
 * App.js - Main application component for SkullPOS
 *
 * SkullPOS is a Point of Sale system designed for Skull Space with features including:
 * - User authentication (email/password login, quick-access PIN)
 * - Product catalog with categories
 * - Shopping cart with member discounts
 * - Multi-method payment processing (Stripe, Cash, Gift Cards)
 * - Barcode scanning support
 * - Sales reporting and analytics
 *
 * This component handles routing and the two auth guards below. There is
 * no self-registration route -- staff accounts are created by an admin
 * directly in the Appwrite console and added to a team.
 */

import { useAppwrite } from "./utils/api";
import { useEffect, useState } from "react";
import { BrowserRouter as Router, Navigate, Route, Routes, useNavigate } from "react-router-dom";

// Component imports
import Login from "./components/login";
import POS from "./components/pos/pos";
import SelfCheckout from "./components/selfCheckout/selfCheckout";

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
	const { account, logout, pinMode } = useAppwrite();
	const navigate = useNavigate();
	const [ready, setReady] = useState(false);

	useEffect(() => {
		let cancelled = false;

		account
			.get()
			.then((acct) => {
				if (cancelled) return;

				if (acct && acct.email) {
					setReady(true);
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
	}, [account, logout, navigate, pinMode]);

	return ready ? children : null;
}

/**
 * Gate for the /self-checkout route. Only a PIN verified as
 * selfCheckout:true satisfies this -- a staff email/password session does
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
