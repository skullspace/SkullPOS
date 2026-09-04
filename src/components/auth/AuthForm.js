/**
 * AuthForm.js - Reusable authentication form component
 * 
 * Shared form for login and register flows with:
 * - Customizable form fields
 * - Error handling and display
 * - Submit handling
 * - Navigation options
 */

import React from "react";
import {
	Box,
	Button,
	Input,
	Typography,
	FormControl,
	FormLabel,
	Paper,
} from "@mui/material";

/**
 * AuthForm component - reusable for login and register
 * 
 * @param {Object} props - Component props
 * @param {string} props.title - Form title
 * @param {Array} props.fields - Array of field configurations
 * @param {Object} props.values - Current field values
 * @param {Function} props.onFieldChange - Handle field value changes
 * @param {string} props.errorMessage - Error message to display
 * @param {Function} props.onSubmit - Handle form submission
 * @param {string} props.submitButtonLabel - Label for submit button
 * @param {Array} props.secondaryActions - Array of secondary buttons
 * 
 * @returns {JSX.Element} Authentication form
 */
const AuthForm = ({
	title,
	fields,
	values,
	onFieldChange,
	errorMessage,
	onSubmit,
	submitButtonLabel = "Submit",
	secondaryActions = [],
}) => {
	return (
		<Box
			sx={{
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				justifyContent: "center",
				height: "100vh",
				padding: 2,
			}}
		>
			<Paper
				elevation={4}
				sx={{
					width: "100%",
					maxWidth: 400,
					p: 4,
					borderRadius: 3,
				}}
			>
				<Typography variant="h4" component="h1" align="center" sx={{ mb: 3 }}>
					{title}
				</Typography>
				<form onSubmit={onSubmit}>
					{/* Render form fields */}
					{fields.map((field) => (
						<FormControl key={field.name} required fullWidth>
							<FormLabel>{field.label}</FormLabel>
							<Input
								type={field.type || "text"}
								value={values[field.name] || ""}
								onChange={(e) => onFieldChange(field.name, e.target.value)}
								sx={{ mb: 2 }}
							/>
						</FormControl>
					))}

					{/* Error message display */}
					{errorMessage && (
						<Typography variant="body2" color="error" sx={{ mb: 2 }}>
							{errorMessage}
						</Typography>
					)}

					{/* Submit button */}
					<Button
						type="submit"
						variant="contained"
						color="primary"
						size="large"
						fullWidth
						sx={{ mb: 1 }}
					>
						{submitButtonLabel}
					</Button>

					{/* Secondary actions (e.g., "Register" from login) */}
					{secondaryActions.map((action, index) => (
						<Button
							key={index}
							type="button"
							variant="outlined"
							color="inherit"
							fullWidth
							onClick={action.onClick}
							sx={{ mb: index < secondaryActions.length - 1 ? 1 : 0 }}
						>
							{action.label}
						</Button>
					))}
				</form>
			</Paper>
		</Box>
	);
};

export default AuthForm;
