/**
 * environment.js - Single source of truth for "is this a test-mode
 * deployment": local dev and the UAT domain both use Stripe test keys and
 * write `testing: true` transactions; every other hostname is production.
 * Previously duplicated as `isLocalhost`/`test` in api.js, checkout.js, and
 * stripe.js -- centralized here so a new test environment (like UAT) only
 * needs to be added in one place.
 */
const TEST_HOSTNAMES = ["localhost", "127.0.0.1", "uat.skullpos.shotty.tech"];

export const isTestEnvironment = TEST_HOSTNAMES.includes(window.location.hostname);
