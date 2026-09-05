/**
 * Login.js - User authentication component
 * 
 * Allows users to authenticate with their Appwrite account using email and password.
 * Features:
 * - Email/password input validation
 * - Error handling and display
 * - Quick-access PIN entry for a restricted cashier session
 * - Automatic redirect to POS after successful login
 */

import React, { useState } from "react";
import { useAppwrite } from "../utils/api";
import { useNavigate } from "react-router-dom";
import AuthForm from "./auth/AuthForm";
import PinEntryDialog from "./PinEntryDialog";

/**
 * Login component
 * 
 * @returns {JSX.Element} Login form with email and password fields
 */
const Login = () => {
	const { login } = useAppwrite();
	const navigate = useNavigate();

	// Form state
	const [formValues, setFormValues] = useState({
		email: "",
		password: "",
	});
	const [errorMessage, setErrorMessage] = useState("");
	const [pinDialogOpen, setPinDialogOpen] = useState(false);

	/**
	 * Handle field value changes
	 * 
	 * @param {string} fieldName - Name of field being updated
	 * @param {string} value - New field value
	 */
	const handleFieldChange = (fieldName, value) => {
		setFormValues((prev) => ({
			...prev,
			[fieldName]: value,
		}));
	};

	/**
	 * Handle login form submission
	 * Attempts to authenticate user and redirects to POS on success
	 * 
	 * @param {Event} e - Form submission event
	 */
	const handleLogin = async (e) => {
		e.preventDefault();
		try {
			await login(formValues.email, formValues.password);
			setErrorMessage("");
			navigate("/pos");
		} catch (err) {
			console.error("Login error:", err);
			setErrorMessage(err.message || "Login failed");
		}
	};

	// Form field configuration
	const loginFields = [
		{ name: "email", label: "Email", type: "email" },
		{ name: "password", label: "Password", type: "password" },
	];

	// Secondary actions -- self-registration was removed: it only checked
	// that the email string ended in "@skullspace.ca" (no real verification
	// of ownership), so it was effectively as open as anonymous access.
	// Staff accounts are created by an admin directly in the Appwrite
	// console and added to a team; everyone else uses the PIN below.
	const secondaryActions = [
		{
			label: "Quick Access PIN",
			onClick: () => setPinDialogOpen(true),
		},
	];

	return (
		<>
			<AuthForm
				title="Login"
				fields={loginFields}
				values={formValues}
				onFieldChange={handleFieldChange}
				errorMessage={errorMessage}
				onSubmit={handleLogin}
				submitButtonLabel="Login"
				secondaryActions={secondaryActions}
			/>
			<PinEntryDialog open={pinDialogOpen} onClose={() => setPinDialogOpen(false)} />
		</>
	);
};

export default Login;
