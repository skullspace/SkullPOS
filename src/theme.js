import { createTheme as createMaterialTheme } from "@mui/material/styles";
import { extendTheme as extendJoyTheme } from "@mui/joy/styles";

// Single source of truth: tokens
const tokens = {
    colors: {
        backgroundDefault: "#0b0b0b",
        backgroundSurface: "#121212",
        surfaceElevated: "#1b1b1b",
        textPrimary: "#ffffff",
        textSecondary: "rgba(255,255,255,0.78)",
        actionHover: "rgba(255,255,255,0.04)",
    },
    // MUI default shadows (25 entries) for full compatibility
    shadows: [
        "none",
        "0px 1px 3px rgba(0,0,0,0.2),0px 1px 1px rgba(0,0,0,0.14),0px 2px 1px -1px rgba(0,0,0,0.12)",
        "0px 1px 5px rgba(0,0,0,0.2),0px 2px 2px rgba(0,0,0,0.14),0px 3px 1px -2px rgba(0,0,0,0.12)",
        "0px 1px 8px rgba(0,0,0,0.2),0px 3px 4px rgba(0,0,0,0.14),0px 3px 3px -2px rgba(0,0,0,0.12)",
        "0px 2px 4px -1px rgba(0,0,0,0.2),0px 4px 5px rgba(0,0,0,0.14),0px 1px 10px rgba(0,0,0,0.12)",
        "0px 3px 5px -1px rgba(0,0,0,0.2),0px 5px 8px rgba(0,0,0,0.14),0px 1px 14px rgba(0,0,0,0.12)",
        "0px 3px 5px -1px rgba(0,0,0,0.2),0px 6px 10px rgba(0,0,0,0.14),0px 1px 18px rgba(0,0,0,0.12)",
        "0px 4px 5px -2px rgba(0,0,0,0.2),0px 7px 10px rgba(0,0,0,0.14),0px 2px 16px rgba(0,0,0,0.12)",
        "0px 5px 5px -3px rgba(0,0,0,0.2),0px 8px 10px rgba(0,0,0,0.14),0px 3px 14px rgba(0,0,0,0.12)",
        "0px 5px 6px -3px rgba(0,0,0,0.2),0px 9px 12px rgba(0,0,0,0.14),0px 3px 16px rgba(0,0,0,0.12)",
        "0px 6px 6px -3px rgba(0,0,0,0.2),0px 10px 14px rgba(0,0,0,0.14),0px 4px 18px rgba(0,0,0,0.12)",
        "0px 6px 7px -4px rgba(0,0,0,0.2),0px 11px 15px rgba(0,0,0,0.14),0px 4px 20px rgba(0,0,0,0.12)",
        "0px 7px 8px -4px rgba(0,0,0,0.2),0px 12px 17px rgba(0,0,0,0.14),0px 5px 22px rgba(0,0,0,0.12)",
        "0px 7px 8px -4px rgba(0,0,0,0.2),0px 13px 19px rgba(0,0,0,0.14),0px 5px 24px rgba(0,0,0,0.12)",
        "0px 7px 9px -4px rgba(0,0,0,0.2),0px 14px 21px rgba(0,0,0,0.14),0px 5px 26px rgba(0,0,0,0.12)",
        "0px 8px 9px -5px rgba(0,0,0,0.2),0px 15px 22px rgba(0,0,0,0.14),0px 6px 28px rgba(0,0,0,0.12)",
        "0px 8px 10px -5px rgba(0,0,0,0.2),0px 16px 24px rgba(0,0,0,0.14),0px 6px 30px rgba(0,0,0,0.12)",
        "0px 8px 11px -5px rgba(0,0,0,0.2),0px 17px 26px rgba(0,0,0,0.14),0px 6px 32px rgba(0,0,0,0.12)",
        "0px 9px 11px -5px rgba(0,0,0,0.2),0px 18px 28px rgba(0,0,0,0.14),0px 7px 34px rgba(0,0,0,0.12)",
        "0px 9px 12px -6px rgba(0,0,0,0.2),0px 19px 29px rgba(0,0,0,0.14),0px 7px 36px rgba(0,0,0,0.12)",
        "0px 10px 13px -6px rgba(0,0,0,0.2),0px 20px 31px rgba(0,0,0,0.14),0px 8px 38px rgba(0,0,0,0.12)",
        "0px 10px 13px -6px rgba(0,0,0,0.2),0px 21px 33px rgba(0,0,0,0.14),0px 8px 40px rgba(0,0,0,0.12)",
        "0px 10px 14px -6px rgba(0,0,0,0.2),0px 22px 35px rgba(0,0,0,0.14),0px 8px 42px rgba(0,0,0,0.12)",
        "0px 11px 14px -7px rgba(0,0,0,0.2),0px 23px 36px rgba(0,0,0,0.14),0px 9px 44px rgba(0,0,0,0.12)",
        "0px 11px 15px -7px rgba(0,0,0,0.2),0px 24px 38px rgba(0,0,0,0.14),0px 9px 46px rgba(0,0,0,0.12)",
    ],
    alert: {
        color: "#ffffff",
        backgroundColor: "#2b2b2b",
        borderColor: "#3a3a3a",
        secondaryColor: "#9e9e9e",
    },
};

// Build Material theme from tokens
export const materialTheme = createMaterialTheme({
    palette: {
        mode: "dark",
        background: {
            default: tokens.colors.backgroundDefault,
            paper: tokens.colors.backgroundSurface,
        },
        text: {
            primary: tokens.colors.textPrimary,
            secondary: tokens.colors.textSecondary,
        },
        action: {
            hover: tokens.colors.actionHover,
        },
        alert: {
            ...tokens.alert,
        },
    },
    components: {
        MuiCssBaseline: {
            styleOverrides: {
                body: {
                    backgroundColor: tokens.colors.backgroundDefault,
                },
            },
        },
    },
});

// Ensure materialTheme.shadows uses token shadows
materialTheme.shadows = tokens.shadows.slice();

// Build Joy theme from same tokens
export const joyTheme = extendJoyTheme({
    colorSchemes: {
        dark: {
            palette: {
                background: {
                    body: tokens.colors.backgroundDefault,
                    surface: tokens.colors.backgroundSurface,
                },
                text: {
                    primary: tokens.colors.textPrimary,
                    secondary: tokens.colors.textSecondary,
                },
                action: {
                    hover: tokens.colors.actionHover,
                },
            },
        },
    },
});

// Populate joyTheme.vars and ensure shadows and Alert palette tokens are present
joyTheme.vars = joyTheme.vars || {};
joyTheme.vars.shadows = tokens.shadows.slice();
joyTheme.vars.palette = joyTheme.vars.palette || {};
joyTheme.vars.palette.Alert = joyTheme.vars.palette.Alert || {
    ...tokens.alert,
};

// Mirror shadows at other common locations
joyTheme.shadows = joyTheme.shadows || joyTheme.vars.shadows;
materialTheme.vars = materialTheme.vars || {};
materialTheme.vars.shadows =
    materialTheme.vars.shadows || materialTheme.shadows;

const themes = { materialTheme, joyTheme };

export default themes;
