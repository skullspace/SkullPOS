// Shared formatting utilities
export function formatCAD(cents) {
    return new Intl.NumberFormat("en-CA", {
        style: "currency",
        currency: "CAD",
    }).format(cents / 100);
}
