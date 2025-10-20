import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";

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
    /* Scale typography and spacing globally by 130% */
    typography: {
        htmlFontSize: 16,
        fontSize: 16 * 1.3,
    },
    spacing: 8 * 1.3,
});

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
    <React.StrictMode>
        <ThemeProvider theme={darkTheme}>
            <CssBaseline enableColorScheme />
            <App />
        </ThemeProvider>
    </React.StrictMode>
);
