# SkullPOS Manual Testing Checklist

This covers everything that needs a human at a real terminal to verify --
real Stripe Terminal hardware, physical PIN entry, actual card charges/
refunds, real email delivery, and cross-view behavior that unit tests
can't see. Everything else (payment math, idempotency, staff/PIN
authorization, per-leg aggregation) is covered by the automated suites:
- `AppwriteFunctions`: `npx jest` (128 tests, all 10 deployed functions)
- `POS`: `npm test` (91 tests)

Run those first. This document is for what they can't reach.

`main` and `uat` now share identical code for every feature below,
including membership dues -- there's no branch-level split anymore.
Membership dues (§11.5-11.6) is instead gated at runtime by
`isTestEnvironment` (`POS/src/utils/environment.js`): the "Pay
Membership Dues" button only renders on `localhost`/`127.0.0.1` and
`uat.skullpos.shotty.tech`, and is invisible -- not just disabled -- on
the real production domain. So testing it locally works regardless of
which branch is checked out; it simply never appears once deployed to
production, no matter the branch.

## Test environment setup

- Use a transaction created with `testing: true` (automatic on
  `localhost`) so Stripe uses test keys and these sales don't pollute
  real sales reports.
- Have a Stripe test-mode card reader (or the Terminal simulated test
  card) and a **second** physical test card available for the
  two-cards split scenario.
- Have at least one test gift card with a known balance (e.g. $10.00)
  that you're allowed to drain/reset, plus its UPC/barcode for scanning
  tests.
- Know one Google account in the `admin` team, one in a `POS` team,
  and one quick-access PIN for a non-staff cashier -- §1 below needs
  all three to exercise each access tier.

---

## 1. Authentication & Sessions

Staff sign in via Google SSO (the Skullspace Google Workspace account)
-- there's no email/password login anymore. What a successful sign-in
actually lands on depends on Appwrite team membership, checked via
`teams.list()` right after the OAuth redirect completes:

| Team membership | Lands on | Restriction |
|---|---|---|
| `admin` | `/pos` | none -- full access |
| `POS` (either team) | `/pos` | same as a PIN cashier (24h Sales Report cap, no comparison deltas, no refunds) |
| no recognized team | `/self-checkout` | same as a kiosk PIN |

Non-`@skullspace.ca` Google accounts are rejected outright regardless
of team membership (Google's own OAuth flow has no way to restrict
this to the Workspace at the consent-screen level, so it's enforced
after the fact).

### 1.1 Google SSO -- admin tier
**Steps:** From the login screen, click "Sign in with Google", complete
the flow with an account that's a member of the **admin** Appwrite
team.
**Expected:** Lands on `/pos`. Hamburger menu shows Sales Report and
Transactions with no time restriction (verified in §7).

### 1.2 Google SSO -- POS tier
**Steps:** Sign in with a Google account that's a member of a **POS**
team but not admin.
**Expected:** Lands on `/pos`, but restricted exactly like a PIN
cashier -- Sales Report capped to 24h with no comparison deltas (§7.3-
7.4), refund button not shown. This is enforced server-side too for
the Sales Report cap (§7.5), not just hidden in the client.

### 1.3 Google SSO -- no recognized team
**Steps:** Sign in with a `@skullspace.ca` Google account that isn't a
member of admin or either POS team.
**Expected:** Redirected straight to `/self-checkout`, never `/pos`.
Manually typing `/pos` afterward redirects back to `/self-checkout`
rather than granting staff access.

### 1.4 Google SSO -- non-Skullspace account rejected
**Steps:** Attempt to sign in with a Google account outside
`@skullspace.ca`, if you have one available to test with.
**Expected:** Immediately logged back out to `/login` with a message
that the account isn't a Skullspace account -- never reaches `/pos` or
`/self-checkout` even momentarily.

### 1.5 A stale PIN-mode flag doesn't leak into a Google login
**Steps:** Log in via PIN on a browser, then -- **without** clicking
Logout (e.g. just close the tab or clear cookies) -- sign back in via
Google SSO with an admin account on that same browser.
**Expected:** Full, unrestricted admin access -- not incorrectly capped
as if still in PIN mode. (This was a real bug earlier: a leftover PIN-
mode flag in `localStorage` silently restricted a genuine staff login
on the same browser until `login`/the Google SSO equivalent started
clearing it.)

### 1.6 Quick-access PIN login
**Steps:** From the login screen, choose "Quick Access PIN", enter a
valid PIN.
**Expected:** Lands on the POS screen as that PIN's labeled cashier
(check the label shown matches the PIN's configured name). Sales
Report is capped to the last 24 hours (§7.3) and refunds are
unavailable if PIN-mode isn't authorized for them (check current
behavior matches intent).

### 1.7 Wrong PIN
**Steps:** Enter an incorrect PIN.
**Expected:** Generic rejection message. Does **not** reveal whether
the PIN exists, is inactive, or is just wrong -- message text should be
identical in all three cases.

### 1.8 Self-registration removed
**Steps:** Manually navigate to `/register` (typed URL or an old
bookmark).
**Expected:** Redirected to `/login`. No registration form is
reachable by any path. The login page shows no "Register" link/button
-- only "Sign in with Google" and "Quick Access PIN".

### 1.9 Logout
**Steps:** Log in (any method), then use the hamburger menu's Logout.
**Expected:** Returns to the login screen. PIN-mode flag is cleared
(confirm by checking that a fresh PIN login afterward doesn't
silently reuse the old label). Reloading the app afterward does not
restore the previous session.

### 1.10 Session survives a reload, PIN mode persists across tabs and restarts
**Steps:** Log in via PIN in one tab; open the app fresh in a second
tab, and separately try closing and reopening the browser entirely.
**Expected:** The second tab picks up the same PIN-mode label without
re-entering the PIN, and it survives a full browser restart too --
`pinMode` is `localStorage`-backed specifically so a kiosk doesn't
have to re-enter its PIN after an overnight power-cycle. Note if this
surprises staff in practice (e.g. a cashier expecting each tab/session
to need its own PIN).

---

## 2. Point of Sale -- building a sale

### 2.1 Tap to add / remove items
**Steps:** Tap an item several times, then use remove/decrement.
**Expected:** Quantity increments/decrements correctly; item drops out
of the cart entirely at 0 rather than showing "x0".

### 2.2 Barcode scan -- item UPC
**Steps:** Scan (or type into the manual UPC field) a real item's
barcode.
**Expected:** "Scanned: <item name>" success message appears. Item is
**not** auto-added to the cart -- confirm a manual tap/button press is
still required (this is intentional per the current code).

### 2.3 Barcode scan -- unknown code
**Steps:** Scan a code that matches no item and doesn't start with the
giftcard prefix.
**Expected:** "Barcode not found: <code>" error message.

### 2.4 Barcode scan -- gift card code
**Steps:** Scan a real giftcard barcode (starts with `75855`).
**Expected:** Routed into the giftcard flow (lookup + balance shown),
not treated as an item lookup.

### 2.5 Long-press to "86" an item
**Steps:** Long-press an item tile at the register.
**Expected:** The tile grays out and becomes unsellable (tapping it no
longer adds it to cart) for the rest of this browser session -- long-press
again to re-enable it for this session. This is a same-session-only
toggle (`item.js`'s local `disabled` state resets on reload) that
**also** persists server-side by clearing the item's `enabled_menu` flag
(via `Item-SetEnabled`), which pulls it off the customer-facing MEnu
display board too -- confirm both halves actually happen (register tile
grays out immediately, and the MEnu app stops showing it).
Note: an item with `enabled_pos: false` (a brand-new, not-yet-configured
item) doesn't render as a tile at all, so it can't be long-pressed here --
see §13 (Manage Items) for making a new item reachable in the first
place.

---

## 3. Single-method payments

### 3.1 Cash, exact amount
**Steps:** Add items, choose Cash, complete.
**Expected:** Cash modal appears, sale completes, cart clears, success
shown. Transaction later shows `payment_method: cash`, `status:
complete`.

### 3.2 Card, single charge
**Steps:** Add items, choose Card, tap the reader with a real test
card.
**Expected:** Reader prompts for tap/insert, charge succeeds, success
alert shows the correct total + tip, cart clears. Confirm the charge
actually appears in the Stripe test dashboard for the right amount.

### 3.3 Gift card, fully covers the total
**Steps:** Add items whose total is *less than* the gift card's
balance, scan/select the gift card, complete.
**Expected:** Sale completes without ever touching the card reader.
Gift card balance afterward is reduced by exactly the sale total (spot
-check the actual balance, not just the UI).

### 3.4 Gift card, partial -- remainder on card
**Steps:** Add items whose total *exceeds* the gift card's balance,
apply the gift card, then charge the remainder.
**Expected:** UI shows the remaining balance to charge; card reader
charges exactly that remainder (not the full total); gift card balance
drops to 0; sale completes once the card leg confirms.

### 3.5 Gift card not found
**Steps:** Scan/enter a code that doesn't match any gift card.
**Expected:** Clear "not found" feedback, no crash, cashier can still
fall back to another payment method.

---

## 4. Split payments (new feature -- highest priority section)

For each of the following, verify **after** the sale: the transaction's
payment breakdown (however it's surfaced to staff -- Transactions view
or DB inspection) shows the correct legs and amounts, and the total of
all legs equals the sale total exactly (no over/under by a cent).

### 4.1 Cash + Card
**Steps:** Start a split payment, add a cash leg for part of the
total, then a card leg for the remainder.
**Expected:** Running "remaining balance" updates correctly after the
cash leg before the card charge starts. Card leg charges exactly the
remaining amount, not the full total. Sale completes once both legs
land.

### 4.2 Gift card + Cash
**Steps:** Split payment, gift card leg for part of the total, cash
leg for the rest.
**Expected:** Gift card balance decremented by exactly its leg amount
(not the whole total). Sale completes after the cash leg.

### 4.3 Gift card + Credit (card)
**Steps:** Split payment, gift card leg, then card leg for the
remainder.
**Expected:** Same as 4.2 but the second leg is a real card charge for
the exact remaining amount.

### 4.4 Two separate physical cards
**Steps:** Split payment, add a "Card" leg, charge card #1 for part of
the total; add a second "Card" leg, charge card #2 for the rest.
**Expected:** Two distinct Stripe charges appear (two different
PaymentIntent ids), each for the correct sub-amount. This is the
scenario that specifically justifies "Card" being repeatable rather
than a fixed single slot.

### 4.5 Split payment abandoned partway through
**Steps:** Apply one leg (e.g. cash), then leave the split-payment
screen without finishing (navigate away or close the panel).
**Expected:** Confirm what actually happens to the transaction --
should stay `pending` with the partial leg recorded, recoverable later
rather than silently lost or double-chargeable. Verify re-entering the
same transaction shows the correct remaining balance rather than
resetting to the full total.

### 4.6 Overpaying a leg
**Steps:** In a split payment with $5 remaining, try to apply a $10
cash or gift card leg.
**Expected:** Rejected with a clear message; remaining balance
unchanged; no leg recorded.

---

## 5. Payment failure & recovery (critical -- this is what the
`cardChargeUnconfirmed` work this session was for)

### 5.1 Card charged, but recording fails and all retries are exhausted
This is hard to trigger for real (needs the card charge to succeed
while the network to Appwrite specifically drops), so simulate it as
close as possible: pull the network connection (wifi off / unplug)
immediately after the reader confirms the tap but before the app can
call back to Appwrite, then restore it after ~5 seconds.
**Expected:**
- The app does **not** show "Payment Successful".
- An error banner appears naming the actual PaymentIntent id and
  explicitly says not to charge the card again.
- The error modal's **Retry button is hidden** (not just disabled) --
  confirm you cannot accidentally re-charge the same sale.
- Check Stripe's test dashboard: the charge did go through for the
  correct amount even though the app couldn't confirm it.
- Manually verify in the Transactions view / DB that the transaction is
  still `pending` (not falsely marked complete, not silently lost) --
  and that a staff member has a way to reconcile it (mark it, refund
  the stray charge, etc. -- confirm the actual operational answer here
  matches what the team expects).

### 5.2 Card declined
**Steps:** Use a test card configured to always decline.
**Expected:** Clear decline message shown (code + message from
Stripe). No transaction is falsely marked paid. Cart is retained so
the cashier can retry with a different method without re-ringing the
sale.

### 5.3 Terminal disconnected mid-charge
**Steps:** Physically power off / disconnect the reader after tapping
"Charge" but before payment completes.
**Expected:** A real, actionable error surfaces (not a silent hang).
Reconnecting the terminal (§8) and retrying should work cleanly.

### 5.4 Split-leg retry safety (second card leg fails after the first succeeded)
**Steps:** In a two-card split (4.4), let the first card leg succeed,
then force the second leg's recording to fail transiently (network
blip) and let it auto-retry.
**Expected:** The retry does not double-apply the first leg or
double-charge; final state has exactly two legs, remaining balance
correct. (The underlying idempotency guard is unit-tested; this
confirms it holds under a real, timed hardware interaction.)

---

## 6. Refunds

### 6.1 Itemized refund confirmation
**Steps:** Open a completed split-payment transaction (e.g. gift card
+ card) in the refund flow.
**Expected:** Confirmation dialog lists **each leg separately** (method
+ amount), not a single "paid by X" line -- e.g. "Gift Card: $4.00" and
"Card: $6.00" as two rows, summing to the sale total.

### 6.2 Full refund -- cash only
**Steps:** Refund a cash-only sale.
**Expected:** Marked refunded immediately; no external call is made
(there's nothing to reverse for cash) -- just confirm the UI still
reports it correctly as reversed.

### 6.3 Full refund -- card only
**Steps:** Refund a single-card sale.
**Expected:** A real refund appears in the Stripe test dashboard for
the exact original amount. Transaction flips to `refunded`.

### 6.4 Full refund -- split (gift card + card)
**Steps:** Refund a gift card+card split sale.
**Expected:** Gift card balance is credited back by exactly its leg
amount (verify the actual balance, not just a UI toast). Stripe shows a
refund for exactly the card leg's amount. Both legs show
reversed in the UI.

### 6.5 Refunding an already-refunded transaction
**Steps:** Try to refund the same transaction again.
**Expected:** Rejected outright ("already refunded" or similar) -- no
double refund, no second Stripe refund call, gift card not credited
twice.

### 6.6 Partial leg failure during a refund
This is hard to force for real; if there's a way to simulate one leg's
reversal failing (e.g. temporarily revoke the giftcard doc, or use an
already-fully-refunded PaymentIntent to force Stripe to reject a second
refund attempt on it), confirm:
**Expected:** The transaction is still marked refunded (so it can't be
sold again), the succeeding leg(s) are reversed, and the failing leg is
clearly flagged for manual follow-up -- not silently swallowed.

---

## 7. Sales Report

### 7.1 Admin: full range + comparison deltas
**Steps:** Log in via Google SSO with an account in the **admin** team,
open Sales Report, pick a bounded date range (e.g. "yesterday").
**Expected:** Stat cards (Sale Volume, Alcohol, Food, Non-Alcoholic,
Other) each show a delta against the immediately-preceding period of
equal length. Sanity-check the delta math against two ranges you can
compute by hand from a handful of known test sales.

### 7.2 Admin: "All Time"
**Steps:** Select the "All Time" option (no bounded start date).
**Expected:** Report loads normally but shows **no** comparison delta
(there's no equal-length prior period to compare against) -- confirm
the UI degrades gracefully (no blank/NaN deltas).

### 7.3 24-hour cap enforced for PIN-mode and POS-team logins alike
**Steps:** Try each of: a quick-access PIN cashier, and a Google SSO
login whose account is in a **POS** team but not admin. In each, open
Sales Report and try to request a range older than 24 hours (e.g. last
week).
**Expected:** Both silently clamp to the last 24 hours rather than
erroring -- confirm the numbers shown genuinely only cover the last
day (cross-check against a known older test sale that should be
excluded). A POS-team Google login is restricted exactly the same as a
PIN cashier here, not treated as staff.

### 7.4 Neither restricted mode gets comparison deltas
**Steps:** As a PIN-mode cashier, and separately as a POS-team (non-
admin) Google login, check the stat cards.
**Expected:** No delta/comparison numbers are shown at all in either
case, even though an admin viewing the same day would see them -- this
is intentional (prevents leaking older aggregate data through a
delta).

### 7.5 The 24h cap is enforced server-side, not just hidden in the UI
**Steps:** As a POS-team (non-admin) Google login, try to force a
wider range some other way than the date picker if you can (e.g.
replaying the Sales-Report function's own request with a modified
`startDate`, if you have a way to do that).
**Expected:** Still clamped to 24h -- `Sales-Report`'s own `isAdmin()`
check (not the client) is what actually enforces this, so it can't be
bypassed by skipping the UI. `restricted: true` in the response is the
tell.

### 7.6 Category & COGS sanity check
**Steps:** Ring a known alcoholic item, a known "Food"-category item,
and an item with ingredient-based COGS configured.
**Expected:** Alcohol amount bucket, Food amount bucket, and COGS
figure all move by the expected amounts after the report refreshes.

---

## 8. Transactions view

### 8.1 Cancel an in-progress card attempt
**Steps:** Start a card charge, then cancel before the reader confirms
(if the UI allows this) or use the cancel action for a stuck pending
transaction.
**Expected:** Transaction flips to `cancelled`, not left dangling as
`pending` forever, and is not treated as a completed sale anywhere in
reporting.

### 8.2 A card-charge-unconfirmed transaction is NOT auto-cancelled
**Steps:** Reproduce 5.1 (or as close as practical), then check
whether closing the error modal cancels the transaction.
**Expected:** It must **not** silently cancel -- the charge may have
actually gone through, so auto-cancelling it would create a paid sale
with no record. Confirm the transaction stays in a recoverable state.

### 8.3 Browsing transaction history
**Steps:** Open Transactions, scroll/paginate through history, filter
test vs. live if that control exists.
**Expected:** Legacy (pre-split-payment) transactions display their
payment method correctly even though they predate the `payments` field
-- confirm at least one old transaction shows sensible data, not
blank/broken fields.

---

## 9. Hamburger menu

### 9.1 Grouped sections render correctly
**Steps:** Open the hamburger menu.
**Expected:** Items are grouped with visible separation into: hardware
/ session setup (Select Terminal, Manual UPC, Fullscreen), reports
(Sales Report, Transactions), settings (Hide alcohol items), and
session (Logout) -- confirm the grouping reads clearly and every item
still works exactly as before (grouping is meant to be purely visual).

### 9.2 Each menu action still functions
**Steps:** Click through every item in the menu once.
**Expected:** Select Terminal opens terminal selection, Manual UPC
opens the manual entry field, Fullscreen toggles fullscreen, Sales
Report and Transactions navigate correctly, Hide alcohol items
actually filters the item grid, Logout signs out.

---

## 10. Stripe Terminal hardware

### 10.1 Connect a reader
**Steps:** From a fresh app load, use "Select Terminal" to discover and
connect a real reader.
**Expected:** Reader shows as connected; a subsequent card charge
works on the first try.

### 10.2 Reconnect after a dropped connection
**Steps:** Disconnect the reader (power off / out of range), then
reconnect it.
**Expected:** The app detects the drop (doesn't hang trying to charge
against a dead connection) and successfully reconnects without
requiring a full app reload.

### 10.3 Switch readers mid-session
**Steps:** With one reader connected, use "Select Terminal" to switch
to a different physical reader.
**Expected:** The new reader becomes the active one; a charge attempt
uses it, not the old one.

---

## 11. Self-Checkout Kiosk

### 11.1 Kiosk PIN login
**Steps:** From the login screen, choose "Quick Access PIN", enter the
self-checkout kiosk's PIN (not a staff/cashier PIN).
**Expected:** Lands on `/self-checkout`, not `/pos`. Logging in with a
staff email/password or an ordinary cashier PIN must **not** reach
`/self-checkout`.

### 11.2 Card-only enforcement
**Steps:** Add items at self-checkout and reach checkout.
**Expected:** Only a card/tap payment path is offered -- no cash or
gift-card option is reachable anywhere in the self-checkout UI.

### 11.3 Idle reset (90 seconds)
**Steps:** Add items to the cart, or start "Pay Membership Dues" and
reach the info or confirm screen, then stop touching the screen for 90
seconds.
**Expected:** The screen resets back to the empty shop view on its own
-- an abandoned cart or an abandoned membership-dues attempt doesn't sit
there waiting for the next customer.

### 11.4 Manual "Email My Receipt" after a regular purchase
**Steps:** Complete a normal item purchase at self-checkout.
**Expected:** The success screen offers an email field for the
receipt; entering an address and submitting sends it (confirm delivery
via Resend's log or the inbox).

### 11.5 Pay Membership Dues
**Steps:** With an empty cart (the button only shows when the cart is
empty), tap "Pay Membership Dues" in the top bar, enter a name and a
validly-formatted email, continue to the confirm screen (shows
"$40.00/month" plus the entered name/email), then pay with a real test
card.
**Expected:**
- Continuing off the info screen is blocked until both a name and a
  validly-formatted email are entered.
- On success, a distinct "Membership dues paid!" screen shows -- not the
  regular item-purchase success screen -- and the member's receipt is
  emailed **automatically**, with no manual button (unlike 11.4).
- A finance notification email also sends automatically. **In a
  `testing:true` transaction this goes to the test recipient
  (`everett.bazzocchi@skullspace.ca`), never `finance@skullspace.ca` --
  only a genuinely non-testing transaction notifies finance@, so do not
  create one just to check this by hand.**
- The transaction is tagged `channel: "membership"` (check via
  Transactions view or the DB), distinct from `pos`/`self_checkout`.

### 11.6 Membership dues isolated in Sales Report
**Steps:** After 11.5, open Sales Report (staff) and toggle the channel
filter to "Membership".
**Expected:** The $40.00 payment shows under "Membership" but not under
"POS" or "Self-Checkout".

### 11.7 Membership dues is invisible on the real production domain
**Steps:** Load the app on the actual production URL (not `localhost`
or `uat.skullpos.shotty.tech`) and open self-checkout with an empty
cart.
**Expected:** No "Pay Membership Dues" button anywhere -- confirms
`isTestEnvironment` (`POS/src/utils/environment.js`) is correctly
gating it off in production, not just hiding it in this dev/uat pass.

### 11.8 Cart shown on the physical reader
**Steps:** At self-checkout, add a couple of items and watch the
reader's own screen (not the kiosk's). Then start "Pay Membership
Dues" and reach the confirm screen.
**Expected:** The reader displays the current cart's line items and
total as items are added/removed, matching what `pos.js` already does
for the staff register. During the membership-dues confirm step, the
reader shows a single "Membership Dues" line item for $40.00 instead
of the shop cart. Clearing the cart (or backing out of the membership
flow) clears the reader's display too.

---

## 12. Email Receipts

### 12.1 Transactions view -- Email Receipt button
**Steps:** Open Transactions (staff), expand a `complete` or
`refunded` transaction.
**Expected:** An "Email Receipt" button appears next to Refund --
available even in PIN-restricted mode, unlike Refund. Entering an
email and confirming sends a receipt (confirm delivery).

### 12.2 Self-checkout manual receipt
See §11.4.

### 12.3 Receipt content sanity check
**Steps:** Open a received receipt email.
**Expected:** Itemized cart and correct total, recognizable as a
SkullPOS receipt rather than a raw/blank template.

---

## 13. Manage Items

### 13.1 Reachability is staff-login-only
**Steps:** Log in as staff via email/password, open the hamburger
menu. Separately, log in via **any** quick-access PIN (including the
one labeled "Staff") and open the same menu.
**Expected:** "Manage Items" appears between Transactions and the
alcohol-hide toggle for the email/password login, and is **absent**
for every PIN login -- catalog management is deliberately staff-login
only, not reachable from a quick-access PIN even when that PIN is
labeled "Staff".

### 13.2 Making a brand-new item sellable
**Steps:** Create a new item directly in the Appwrite console (or use
one just added) -- it defaults to invisible everywhere, since it won't
appear anywhere in the register grid yet. Open Manage Items, search
for it by name, toggle "At Register" on.
**Expected:** The item now appears -- and is addable to cart -- back on
the main POS screen without a page reload. This is the in-app path
that didn't exist before this feature (previously required editing the
item directly in the Appwrite console).

### 13.3 Customer-menu toggle
**Steps:** In Manage Items, toggle "On Customer Menu" for an item.
**Expected:** Reflected in the MEnu customer-facing display app (a
separate app -- confirm it actually picks up the change on its own
refresh cycle).

### 13.4 Search filter
**Steps:** Type a partial item name into the search box.
**Expected:** The list filters live, case-insensitively.

---

## 14. Regression checks specific to this session's changes

- [ ] A transaction created **before** the split-payment migration
  (no `payments` field, only legacy `stripe_id`/`giftcard_amount`
  fields) still refunds correctly and still reports correctly in Sales
  Report.
- [ ] `Transaction-ApplyGiftcard` and `Transaction-RecordCardPayment`
  (the two retired functions) are actually gone from the deployed
  Appwrite project, not just unused in the client -- confirm nothing
  still calls them.
- [x] The "Test" admin-team account flagged during the earlier audit --
  removed from the `admin` team; confirm it hasn't reappeared.
- [x] The placeholder `PINS_JSON` value flagged earlier -- replaced
  with real, unique staff/kiosk PINs; confirm nobody is still using a
  since-rotated PIN out of habit.
- [ ] `Item-SetEnabled`'s `field` allowlist (`enabled_menu`/
  `enabled_pos` only) actually rejects any other field name -- protects
  against the client gaining effective write access to arbitrary
  `pos_items` fields through this endpoint.
- [x] `Stripe-RefundPayment`'s execute-permission narrowed from all
  three original `STAFF_TEAM_IDS` teams to admin-only, matching
  `Sales-Report`'s 24h-cap split (§7.5) -- a POS-team Google login's
  hidden refund button (§1.2) is now backed by an actual server-side
  restriction, not just hidden client-side. Confirm a POS-team member
  calling that function directly gets rejected, not just the button
  being absent from the UI.
