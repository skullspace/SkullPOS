/**
 * Alert.js - Reusable notification/alert component
 * 
 * Used throughout the app to display temporary notifications
 * with auto-dismiss functionality
 */

import { Alert, Collapse } from "@mui/material";

/**
 * Alert component - displays temporary notifications
 * 
 * @param {Object} props - Component props
 * @param {boolean} props.isOpen - Whether alert is visible
 * @param {string} props.message - Alert message text
 * @param {string} props.severity - Alert type: 'success', 'error', 'warning', 'info'
 * @param {Function} props.onClose - Callback when alert closes
 * 
 * @returns {JSX.Element} Alert component
 */
const AlertNotification = ({ isOpen, message, severity = "info", onClose }) => {
	return (
		<Collapse id="primaryAlert" in={isOpen}>
			<Alert
				variant="filled"
				open={isOpen}
				onClose={onClose}
				severity={severity}
				sx={{ boxShadow: 4 }}
			>
				{message}
			</Alert>
		</Collapse>
	);
};

export default AlertNotification;
