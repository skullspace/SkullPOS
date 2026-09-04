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
 * This component handles:
 * - Route management (Login, Register, POS)
 * - User session verification and redirection
 * - Authentication state management
 */

import { useAppwrite } from "./utils/api";
import { useEffect } from "react";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";

// Component imports
import Login from "./components/login";
import Register from "./components/register";
import POS from "./components/pos/pos";

/**
 * Main App component - Manages routing and authentication
 * 
 * Authentication flow:
 * 1. Checks if user has active session
 * 2. Redirects unauthenticated users to /login
 * 3. Redirects authenticated users on login/register pages to /pos
 * 4. Handles session verification on route changes
 * 
 * @returns {JSX.Element} Router with protected routes
 */
export default function App() {
	const { account, logout } = useAppwrite();

	const route = window.location.pathname;
	
	// Redirect root path to POS dashboard
	if (route === "/") {
		window.location.href = "/pos";
	}

	/**
	 * Effect: Verify user session and handle redirects
	 * 
	 * Logic:
	 * - If user has valid session with email: allow access or redirect to /pos if on auth pages
	 * - If user has session but no email: logout and redirect to /login
	 * - If user has no session: redirect to /login (unless already on auth pages)
	 */
	useEffect(() => {
		// Verify account state on route change
		account
			.get()
			.then((acct) => {
				// User has a valid session
				if (acct && acct.email) {
					// If logged-in user tries to access login/register, redirect to POS
					if (route === "/login" || route === "/register") {
						return account.get().then((acct) => {
							if (acct && acct.email) {
								return (window.location.href = "/pos");
							}
						});
					} else return;
				}
				
				const loginPage = route === "/login" || route === "/register";

				// Account exists but has no email - invalid state
				if (acct && !acct.email && !loginPage) {
					logout();
					return (window.location.href = "/login");
				}

				// No account and not on login page - redirect to login
				if (!loginPage) {
					return (window.location.href = "/login");
				}
			})
			.catch((err) => {
				// Session check failed - user is not authenticated
				if (!(route === "/login" || route === "/register")) {
					return (window.location.href = "/login");
				}
			});
	}, [account, logout, route]);

	return (
		<Router>
			<Routes>
				{/* Public routes - accessible without authentication */}
				<Route path="/login" element={<Login />} />
				<Route path="/register" element={<Register />} />
				
				{/* Protected route - POS dashboard (authentication checked in useEffect) */}
				<Route path="/pos" element={<POS />} />
			</Routes>
		</Router>
	);
}
