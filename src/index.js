/**
 * index.js - Application entry point
 * 
 * Configures:
 * - React rendering with ReactDOM
 * - Material-UI dark theme (scaled 130% for better visibility)
 * - Global styling and typography
 */

import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";

/**
 * Dark theme configuration for SkullPOS
 * - Primary color: Indigo (#3f51b5)
 * - Secondary color: Pink (#f50057)
 * - Typography and spacing scaled to 130% for readability on POS displays
 */
const darkTheme = createTheme({
	palette: {
		mode: "dark",
		primary: {
			main: "#3f51b5",
		},
		secondary: {
			main: "#f50057",
		},
	},
	// Scale typography and spacing globally by 130% for better visibility on POS terminals
	typography: {
		htmlFontSize: 16,
		fontSize: 16 * 1.3,
	},
	spacing: 8 * 1.3,
});

/**
 * Initialize React application with theme provider
 * CssBaseline normalizes browser default styles
 * ThemeProvider applies Material-UI theme globally
 */
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
	<ThemeProvider theme={darkTheme}>
		<CssBaseline enableColorScheme />
		<App />
	</ThemeProvider>
);
