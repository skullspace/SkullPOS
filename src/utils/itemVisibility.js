/**
 * itemVisibility.js - Toggle a menu item's enabled_menu/enabled_pos flag,
 * server-side
 *
 * The client has no write access to pos_items at all (see the POS
 * PIN-system security plan) -- a blanket update grant would let any
 * session set any field on any item directly (price, alcohol flag, etc.),
 * not just these two. See AppwriteFunctions/functions/Item-SetEnabled.
 */

const ITEM_SET_ENABLED_FUNCTION_ID = "6a9c6aad6d4a29ab66ee";

/**
 * @param {"enabled_menu"|"enabled_pos"} [field] defaults to enabled_menu
 * @returns {Promise<{ok: boolean, enabled?: boolean, error?: string}>}
 */
export async function setItemEnabled({ functions, itemId, enabled, field }) {
	const response = await functions.createExecution({
		functionId: ITEM_SET_ENABLED_FUNCTION_ID,
		body: JSON.stringify({ itemId, enabled, ...(field ? { field } : {}) }),
	});
	return JSON.parse(response.responseBody || "{}");
}
