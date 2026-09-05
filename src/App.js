/**
 * App.js - Main application component for SkullPOS
 *
 * SkullPOS is a Point of Sale system designed for Skull Space with features including:
 * - User authentication (login/register)
 * - Product catalog with categories
 * - Shopping cart with member discounts
 * - Multi-method payment processing (Stripe, Cash, Gift Cards)
 * - Barcode scanning support
 * - Sales reporting and analytics
 *
 * This component handles routing and the two auth guards below.
 */

import { useAppwrite } from "./utils/api";
import { useEffect, useState } from "react";
import { BrowserRouter as Router, Navigate, Route, Routes, useNavigate } from "react-router-dom";

// Component imports
import Login from "./components/login";
import Register from "./components/register";
import POS from "./components/pos/pos";

/**
 * Gate for the /pos route. Renders nothing until the session check
 * resolves -- an unauthenticated visitor should never see even a flash of
 * the POS screen -- then either renders children or redirects to /login.
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
				// flag right before creating the session).
				if (acct && pinMode) {
					setReady(true);
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
 * Gate for /login and /register. Sends an already-logged-in visitor
 * straight to /pos instead of showing them the auth form again.
 */
function RedirectIfAuthed({ children }) {
	const { account, pinMode } = useAppwrite();
	const navigate = useNavigate();

	useEffect(() => {
		let cancelled = false;

		account
			.get()
			.then((acct) => {
				if (!cancelled && acct && (acct.email || pinMode)) {
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
					path="/register"
					element={
						<RedirectIfAuthed>
							<Register />
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
			</Routes>
		</Router>
	);
}
