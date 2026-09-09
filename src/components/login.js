/**
 * Login.js - Staff authentication entry point
 *
 * Staff sign in with their Skullspace Google Workspace account (Google
 * SSO) -- there is no email/password option anymore. Non-staff cashiers
 * and the self-checkout kiosk still use the separate quick-access PIN
 * flow below, unaffected by this.
 */

import React from "react";
import { useSearchParams } from "react-router-dom";
import { useAppwrite } from "../utils/api";
import AuthForm from "./auth/AuthForm";
import PinEntryDialog from "./PinEntryDialog";

const Login = () => {
	const { loginWithGoogle } = useAppwrite();
	const [pinDialogOpen, setPinDialogOpen] = React.useState(false);
	const [searchParams] = useSearchParams();

	const errorMessage =
		searchParams.get("error") === "oauth_failed"
			? "Google sign-in failed -- please try again."
			: searchParams.get("error") === "domain"
				? "That Google account isn't a Skullspace account."
				: "";

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
				fields={[]}
				values={{}}
				onFieldChange={() => {}}
				errorMessage={errorMessage}
				onSubmit={(e) => {
					e.preventDefault();
					loginWithGoogle();
				}}
				submitButtonLabel="Sign in with Google"
				secondaryActions={secondaryActions}
			/>
			<PinEntryDialog open={pinDialogOpen} onClose={() => setPinDialogOpen(false)} />
		</>
	);
};

export default Login;
