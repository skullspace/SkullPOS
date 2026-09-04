/**
 * format.js - Shared formatting utilities
 * 
 * Utility functions for formatting currency and other data types
 * used throughout the POS application
 */

/**
 * Format cents to Canadian currency string
 * Converts integer cents (e.g., 1050) to formatted CAD currency (e.g., "$10.50")
 * 
 * @param {number} cents - Amount in cents (integer)
 * @returns {string} Formatted CAD currency string (e.g., "$10.50")
 * 
 * @example
 * formatCAD(1050)  // Returns "$10.50"
 * formatCAD(0)     // Returns "$0.00"
 * formatCAD(5)     // Returns "$0.05"
 */
export function formatCAD(cents) {
    return new Intl.NumberFormat("en-CA", {
        style: "currency",
        currency: "CAD",
    }).format(cents / 100);
}
