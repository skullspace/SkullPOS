/**
 * Register.js - User registration component
 * 
 * Allows new users to create an account with:
 * - Name, email, and password
 * - Email domain validation (must be @skullspace.ca)
 * - Error handling for registration failures
 * - Navigation back to login after successful registration
 */

import React, { useState } from "react";
import { useAppwrite } from "../utils/api";
import { useNavigate } from "react-router-dom";
import AuthForm from "./auth/AuthForm";

/**
 * Register component
 * 
 * @returns {JSX.Element} Registration form with name, email, and password fields
 */
const Register = () => {
	const { register } = useAppwrite();
	const navigate = useNavigate();

	// Form state
	const [formValues, setFormValues] = useState({
		name: "",
		email: "",
		password: "",
	});
	const [errorMessage, setErrorMessage] = useState("");

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
	 * Handle registration form submission
	 * Validates email domain and creates new user account
	 * Redirects to login page on success
	 * 
	 * @param {Event} e - Form submission event
	 */
	const handleRegister = async (e) => {
		e.preventDefault();
		try {
			await register({
				name: formValues.name,
				email: formValues.email,
				password: formValues.password,
			});
			setErrorMessage("");
			alert("Registration successful! Please login.");
			navigate("/login");
		} catch (err) {
			setErrorMessage(err.message || "Registration failed");
		}
	};

	/**
	 * Navigate back to login page
	 */
	const handleNavigateToLogin = () => {
		navigate("/login");
	};

	// Form field configuration
	const registerFields = [
		{ name: "name", label: "Name", type: "text" },
		{ name: "email", label: "Email", type: "email" },
		{ name: "password", label: "Password", type: "password" },
	];

	// Secondary actions
	const secondaryActions = [
		{
			label: "Back to Login",
			onClick: handleNavigateToLogin,
		},
	];

	return (
		<AuthForm
			title="Register"
			fields={registerFields}
			values={formValues}
			onFieldChange={handleFieldChange}
			errorMessage={errorMessage}
			onSubmit={handleRegister}
			submitButtonLabel="Register"
			secondaryActions={secondaryActions}
		/>
	);
};

export default Register;
