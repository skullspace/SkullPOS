import { useAppwrite } from "./utils/api";
import { useEffect } from "react";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";

// comp imports
import Login from "./components/login";
import Register from "./components/register";
import POS from "./components/pos/pos";

export default function App() {
	const { account, logout } = useAppwrite();

	const route = window.location.pathname;
	if (route === "/") {
		window.location.href = "/pos";
	}

	useEffect(() => {
		// For all other routes, verify account state
		account
			.get()
			.then((acct) => {
				// If an account object is returned and has an email -> go to POS
				if (acct && acct.email) {
					if (route === "/login" || route === "/register") {
						return account.get().then((acct) => {
							if (acct && acct.email) {
								return (window.location.href = "/pos");
							}
						});
					} else return;
				}

				let loginPage = route === "/login" || route === "/register";

				// If account exists but no email, force logout and redirect to login
				if (acct && !acct.email && !loginPage) {
					logout();
					return (window.location.href = "/login");
				}

				if (!loginPage) {
					return (window.location.href = "/login");
				}
			})
			.catch((err) => {
				if (!(route === "/login" || route === "/register")) {
					return (window.location.href = "/login");
				}
			});
	}, [account, logout, route]);

	return (
		<Router>
			<Routes>
				<Route path="/login" element={<Login />} />
				<Route path="/register" element={<Register />} />
				<Route path="/pos" element={<POS />} />
			</Routes>
		</Router>
	);
}
