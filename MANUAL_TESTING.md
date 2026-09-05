# SkullPOS Manual Testing Checklist

This covers everything that needs a human at a real terminal to verify --
real Stripe Terminal hardware, physical PIN entry, actual card charges/
refunds, and cross-view behavior that unit tests can't see. Everything
else (payment math, idempotency, staff/PIN authorization, per-leg
aggregation) is covered by the automated suites:
- `AppwriteFunctions`: `npx jest` (90 tests, all 9 deployed functions)
- `POS`: `npm test` (69 tests, all client-side payment/cart/checkout utils)

Run those first. This document is for what they can't reach.

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
- Know one staff-team login (email/password) and one quick-access PIN
  for a non-staff cashier.

---

## 1. Authentication & Sessions

### 1.1 Email/password login (staff)
**Steps:** Go to the login page, sign in with a staff email/password.
**Expected:** Lands on the POS screen. Hamburger menu shows Sales
Report and Transactions with no time restriction (verified in §6).

### 1.2 Quick-access PIN login
**Steps:** From the login screen, choose "Quick Access PIN", enter a
valid PIN.
**Expected:** Lands on the POS screen as that PIN's labeled cashier
(check the label shown matches the PIN's configured name). Sales
Report is capped to the last 24 hours (§6.2) and refunds are
unavailable if PIN-mode isn't authorized for them (check current
behavior matches intent).

### 1.3 Wrong PIN
**Steps:** Enter an incorrect PIN.
**Expected:** Generic rejection message. Does **not** reveal whether
the PIN exists, is inactive, or is just wrong -- message text should be
identical in all three cases.

### 1.4 Self-registration removed
**Steps:** Manually navigate to `/register` (typed URL or an old
bookmark).
**Expected:** Redirected to `/login`. No registration form is
reachable by any path. The login page shows no "Register" link/button
-- only "Quick Access PIN" as the secondary action.

### 1.5 Logout
**Steps:** Log in (either method), then use the hamburger menu's
Logout.
**Expected:** Returns to the login screen. PIN-mode flag is cleared
(confirm by checking that a fresh PIN login afterward doesn't
silently reuse the old label). Reloading the app afterward does not
restore the previous session.

### 1.6 Session survives a reload, PIN mode does not leak across tabs unexpectedly
**Steps:** Log in via PIN in one tab; open the app fresh in a second
tab.
**Expected:** Confirm actual behavior matches intent for your
deployment (PIN mode is sessionStorage-backed, so it's per-tab by
design) -- note if this surprises staff in practice.

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

### 2.5 Long-press to disable an item (known issue -- verify current behavior)
**Steps:** Long-press an item tile.
**Expected / known gap:** This was flagged earlier this session as
using the wrong field (`enabled_menu` vs `enabled_pos`) and the
hard-hide-vs-gray-out UX was never reconciled. Manually confirm: what
actually happens today, whether newly-added items (which default to
`enabled_pos: false`) are reachable/enablable from the UI at all, and
whether this still needs the follow-up fix discussed but not yet
approved.

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

### 7.1 Staff: full range + comparison deltas
**Steps:** Log in as staff, open Sales Report, pick a bounded date
range (e.g. "yesterday").
**Expected:** Stat cards (Sale Volume, Alcohol, Food, Non-Alcoholic,
Other) each show a delta against the immediately-preceding period of
equal length. Sanity-check the delta math against two ranges you can
compute by hand from a handful of known test sales.

### 7.2 Staff: "All Time"
**Steps:** Select the "All Time" option (no bounded start date).
**Expected:** Report loads normally but shows **no** comparison delta
(there's no equal-length prior period to compare against) -- confirm
the UI degrades gracefully (no blank/NaN deltas).

### 7.3 PIN-mode: 24-hour cap enforced
**Steps:** Log in via PIN, open Sales Report, try to request a range
older than 24 hours (e.g. last week).
**Expected:** The report silently clamps to the last 24 hours rather
than erroring -- confirm the numbers shown genuinely only cover the
last day (cross-check against a known older test sale that should be
excluded).

### 7.4 PIN-mode never gets comparison deltas
**Steps:** As a PIN-mode cashier, check the stat cards.
**Expected:** No delta/comparison numbers are shown at all, even though
staff viewing the same day would see them -- this is intentional
(prevents leaking older aggregate data through a delta).

### 7.5 Category & COGS sanity check
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

## 11. Regression checks specific to this session's changes

- [ ] A transaction created **before** the split-payment migration
  (no `payments` field, only legacy `stripe_id`/`giftcard_amount`
  fields) still refunds correctly and still reports correctly in Sales
  Report.
- [ ] `Transaction-ApplyGiftcard` and `Transaction-RecordCardPayment`
  (the two retired functions) are actually gone from the deployed
  Appwrite project, not just unused in the client -- confirm nothing
  still calls them.
- [ ] The "Test" admin-team account flagged during the earlier audit --
  confirm its purpose/necessity has been resolved or is still tracked.
- [ ] The placeholder `PINS_JSON` value flagged earlier -- confirm it
  has actually been replaced with real, unique staff PINs before this
  ships to real use.
