# SkullPOS

The till. A React app that runs on a touchscreen behind the bar at Skullspace, takes card /
cash / gift card / split payments, and also serves the customer-facing self-checkout kiosk.

Live at **https://skullpos.shotty.tech** (Cloudflare Pages). Source of truth for everything
server-side is the sibling repo `AppwriteFunctions` — this app has no database write access
worth mentioning and cannot move money on its own.

---

## Environments

`src/utils/environment.js` is the only place that decides whether a deployment is "test":

```js
const TEST_HOSTNAMES = ["localhost", "127.0.0.1", "uat.skullpos.shotty.tech"];
export const isTestEnvironment = TEST_HOSTNAMES.includes(window.location.hostname);
```

| | test (`localhost`, `127.0.0.1`, `uat.skullpos.shotty.tech`) | live (anything else, i.e. `skullpos.shotty.tech`) |
|---|---|---|
| Stripe keys | test | live |
| Terminal location id | `tml_Gp1wVQgFkLNRp0` | `tml_GO9PRw37uKAph5` |
| Transactions written with | `testing: true` | `testing: false` |
| Sales Report / Transactions views | show `testing: true` rows only | show live rows only |
| "Pay Membership Dues" button on the kiosk | shown | **not rendered at all** |

That flag is read by four files: `src/utils/api.js`, `src/utils/stripe.js`, `src/utils/checkout.js`
and `src/components/selfCheckout/selfCheckout.js` (the last is what gates the "Pay Membership Dues"
row above). There are no `.env` files and no
build-time environment variables — the running hostname is the switch. A test till and a live
till are the same bundle.

Appwrite endpoint and project are hardcoded in `src/utils/api.js`:
`https://api.cloud.shotty.tech/v1`, project `68f2ac7b00002e7563a8`.

---

## Running and building

```bash
npm install
npm start          # dev server on http://localhost:3000 -- test environment
npm test           # watch mode
npm run build      # runs the FULL test suite first (prebuild), then builds to build/
```

`"prebuild": "react-scripts test --watchAll=false"` — a failing test aborts the build. As of
this writing the suite is 24 files / 261 tests, all passing.

Create React App 5 (`react-scripts`), React 19, MUI 7, `appwrite` 21, `@stripe/terminal-js`.

## Deploying

`git push origin main` → Cloudflare Pages builds and publishes to `skullpos.shotty.tech`.
The `uat` branch serves `uat.skullpos.shotty.tech`, which is a test environment by the table
above.

There is **no CI configuration in this repo** — no `.github/`, no `wrangler.toml`, no pipeline
file. The build command, output directory (`build/`) and branch mapping live in the Cloudflare
Pages project settings, not here. Nothing in the repo will stop you pushing a broken build; run
`npm run build` locally first, which is what actually runs the tests.

**Do not ship this app ahead of `Transaction-RecordPayment`.** Payment-leg retries are safe only
because both sides honour the same `legId` idempotency key (see the DEPLOY COUPLING note in
`src/utils/splitPayment.js`). Against an older deployment of that function a retried leg is
applied twice — a real double charge.

---

## Signing in, and what each tier can do

Route guards live in `src/App.js`. Routes: `/` → `/pos`, `/login`, `/pos`, `/self-checkout`;
anything else redirects to `/login` (this is what catches old `/register` bookmarks — there is
no self-registration).

**Google SSO** (`Sign in with Google`). Any Google account can complete the OAuth flow, so
`RequireAuth` rejects anything not ending in `@skullspace.ca` after the fact. Then team
membership decides the tier:

| Appwrite team | id | Lands on | In the app |
|---|---|---|---|
| `admin` | `68e35aed00144b8cde9d` | `/pos` | everything: refunds, Manage Items, unrestricted Sales Report |
| `POS` | `68ffcecc0026f78f0af8` | `/pos` | same restrictions as a PIN cashier (below) |
| none | — | `/self-checkout` | kiosk only |

(`App.js` also lists `68ffce9a0015d2dc0b0d` as a POS team. No team with that id exists in the
project any more — only the three above do. It is dead but harmless.)

**Quick-access PIN** — for bartenders and the kiosk, no Google account needed. `loginWithPin`
creates an anonymous Appwrite session *first*, then calls `Verify-Pin`, which reads the caller's
user id off the request and adds it to the **PIN Payment Access** team
(`6a9cbb1c95ea7d59dd8c`) on a match. That team membership is what lets an anonymous till execute
`Giftcard-Lookup`, `Transactions-List`, `Transaction-EmailReceipt`, `stripe-getConnectionToken`
and `Stripe-CancelPaymentIntent` at all. Wrong PINs are rate-limited server-side: 5 attempts per
caller and 30 per IP in a 15-minute window, then a lockout with a "try again in N minutes"
message. Don't guess at PINs on a live till.

A PIN can be a cashier PIN, a self-checkout kiosk PIN (`selfCheckout: true` → forced to
`/self-checkout`, and `/pos` is refused), or a **bartender** PIN, which carries a `bartenderId`,
only verifies within an hour either side of that bartender's own event window, attributes every
sale to them, and unlocks the "My Sales" screen.

Restricted mode (PIN cashier, or a POS-team Google login) means: Sales Report clamped to the
last 24 hours with no comparison deltas, no refund button, no Manage Items. The 24h clamp and
the refund block are enforced in the functions themselves, not just hidden in this UI —
`Stripe-RefundPayment` executes for `team:admin` only.

---

## How a sale actually happens

`src/utils/checkout.js` is the one door every sale goes through, on the register and the kiosk
alike. It creates one `pending` document in the `transactions` collection carrying a JSON
snapshot of the cart, `total`, `payment_due`, `discount`, `testing`, `CreatedBy`, `bartenderId`
and `channel` (`"pos"`, `"self_checkout"` or `"membership"`) — then hands off by method. The
client can *create* a transaction; it cannot update one.

Every actual payment is then recorded by **`Transaction-RecordPayment`**
(`6a9c728a297df71f5919`), one leg at a time, appending to the transaction's `payments` array and
decrementing `payment_due`. When `payment_due` hits 0 the function flips the status to
`complete`. That function re-prices the cart from `pos_items` server-side before accepting
anything — `payment_due` was written by this client, so on its own it proves nothing — and it
independently verifies a card leg against the real Stripe API.

**Card.** `checkout.js` → `handleCardPayment.js` → `stripe.js`'s `chargeCard`.
`Stripe-CreatePaymentIntent` mints an intent stamped with `metadata.transactionId`;
`chargeCard` refuses to mint one without a transaction id, because
`Transaction-RecordPayment` rejects any stripe leg whose intent lacks that stamp — and by then
the money is captured. The reader collects with `update_payment_intent: true`, so the customer
can add a tip on the reader and the captured amount is base + tip. The leg recorded is
**tip-exclusive**; the tip is carried separately on `Transactions.tip`, derived server-side from
`amount_details.tip.amount`. Stripe's floor is 50c, so the smallest chargeable amount is 51c
(`STRIPE_MIN_CHARGE_CENTS`).

**Cash.** Selecting Cash opens the cash modal *after* the pending transaction exists. Quick
tender buttons offer the exact total plus whichever of $5/$10/$20/$50/$100 actually covers it,
and change due is previewed live as you type. On submit the leg recorded is the **sale total**,
not the tendered amount — change is a display figure for the cashier and is not stored anywhere.
Tendering less than the total is refused.

**Gift card.** Scan (or key in) a code; `Giftcard-Lookup` returns id, balance, `eventId` and
`active`. `planGiftcardLeg` (`src/utils/giftcard.js`) then decides the split, and deliberately
does *not* apply a naive `min(balance, total)`: that can leave a 1–50c remainder the reader
refuses, which used to wedge the sale after the card had already been debited. Instead it caps
the gift card leg so the card remainder is at least 51c, or — when the sale is too small for any
chargeable split to exist — refuses **before** any debit with a message telling the cashier to
take it in cash. A gift card with `eventId` set is a DJ voucher: only valid during its own
event, can't be combined with a discount, and is revalidated server-side at checkout regardless
of what this client checked.

**Split.** The Split Payment button creates the pending transaction and hands over to
`SplitPaymentPanel`, which records legs one at a time until the remaining balance is zero. Any
mix works, and "Card" twice is how two physical cards on one sale is done. Backing out of a
split that already has legs requires an explicit confirmation and cancels the sale server-side
via `Transaction-SetStatus`, which credits gift card legs back and voids cash legs — cash
already in the drawer has to be handed back by hand.

**Discounts** come from the `discounts` collection (hand-edited in the Appwrite console; there
is no discount editor). `type` is `percent` or `cents`. `computeTotal` clamps the result to
0..subtotal and refuses to guess at a row whose `type` is neither — it applies no discount and
logs a warning, rather than quietly taking 15 cents off for a row that meant 15%.

### The two states that need a human

Both mean real money moved with nothing recorded against the sale. The till latches itself: the
cart is cleared, the error modal's **Retry is hidden rather than disabled**, and closing the
modal does **not** cancel the transaction — it stays `pending` so it shows up in the
Transactions view to be reconciled.

- **Card charged, leg not saved.** `handleCardPayment` retried three times and never reached the
  server. The message names the PaymentIntent id and says not to charge again. Reconcile against
  Stripe.
- **Gift card debited, leg not saved.** `Transaction-RecordPayment` debits the card and appends
  the leg in two separate writes with no rollback between them, so the single server error
  `"Failed to update transaction"` is the one clean failure that means the balance may already
  have moved. `describeCleanLegFailure` is what says so out loud; every other gift card
  rejection happens before the debit.

---

## Alcohol and bar hours

Alcohol shows on the register grid only when **all** of these hold:

1. `Ticketing-ActiveEvent` answered, and there is an event running.
2. That event has `sellsAlcohol: true`.
3. Now is inside `barOpensAt`–`barClosesAt` — two full ISO-8601 instants, so an overnight window
   is just a close that carries the next day and nothing has to infer one. Set on the admin
   app's Events screen. The register used to fall back to the legacy `barOpenTime`/`barCloseTime`
   `"HH:mm"` strings when the instants were missing; it no longer reads them at all, because
   those two attributes are being deleted from the Events schema. An event that reaches the till
   without a usable instant pair now hides alcohol rather than selling on a wall clock.
4. The admin kill switch is off — the `alcohol_override_disabled` row in the `barData`/`config`
   collection is absent or one of `""`/`false`/`0`/`no`/`off`. Anything else engages it.
5. The local "Hide alcohol items" toggle in the hamburger menu is off. That one is per-device,
   per-session, and a view filter only.

Everything **fails closed**: no event, an unreadable config, a lookup that didn't answer, a
missing or malformed time window — alcohol is hidden. What it does *not* do on an unknown
answer is strip alcohol out of a cart that's already being rung up; that only happens when the
gate is authoritatively known to disallow it. A red `Alcohol gate unavailable — …` chip stays
pinned above the item grid whenever we couldn't establish an answer, so "the bar is shut" and
"we couldn't check" are distinguishable from behind the counter. DJ vouchers are also refused
while it's up.

The event is re-read through `Ticketing-ActiveEvent` every 60 seconds, and immediately on any
Events realtime message. It is **not** read from the `Events` collection directly: that
collection is admin-readable only, the register runs on an anonymous PIN session, and the old
direct read 401'd — which the old catch turned into "no event tonight", permanently hiding
alcohol. The function returns a deliberate field allowlist that excludes the per-event
revenue/cogs/profit columns.

The self-checkout kiosk excludes alcohol unconditionally and always has — age verification
needs a staffed register (`selfCheckoutCategory.js`).

---

## What this app talks to

Direct Appwrite reads (database `67c9ffd9003d68236514` unless noted):

| Collection | id | Client permissions |
|---|---|---|
| Categories | `67c9ffdd0039c4e09c9a` | `read("any")`, `read("users")` |
| Items | `pos_items` | `read("any")`, `read("users")` — `sale_price` is the only price the till charges |
| Discounts | `discounts` | `read("users")` |
| Transactions | `68e4cd3500179ce661c6` | `create("users")` and nothing else — the app never reads or updates a transaction, it asks a function to |
| Config | `config` in database `barData` | `read("any")` |

Everything beyond that row is admin-team-only at the collection level: **gift cards, Events and
Inventory are not readable by a till at all**, and neither is a transaction once created. So all
of this goes through functions:

| Function | id | Who can execute |
|---|---|---|
| Transaction-RecordPayment | `6a9c728a297df71f5919` | `users` |
| Stripe-CreatePaymentIntent | `68f3c860003da00f14d8` | `users` |
| Stripe-CancelPaymentIntent | `68f6272500160b48ee44` | admin + POS + PIN Payment Access |
| stripe-getConnectionToken | `68f2904a00171e8b0266` | admin + POS + PIN Payment Access |
| Giftcard-Lookup | `6a9c5c1acb643536564a` | admin + POS + PIN Payment Access |
| Transaction-SetStatus | `6a9c65091672e55d90b1` | `users` |
| Transaction-EmailReceipt | `6a9cd1ed552967ba3560` | admin + POS + PIN Payment Access |
| Transactions-List | `6a9c687ec05e99a6f1a8` | admin + POS + PIN Payment Access |
| Sales-Report | `6a9c687535280f239b5f` | `users` (clamps to 24h for non-admin itself) |
| Stripe-RefundPayment | `6a9b7671df1f504a084e` | **admin only** |
| Item-SetEnabled | `6a9c6aad6d4a29ab66ee` | **admin only** |
| Ticketing-ActiveEvent | `ticketing-active-event` | `users` |
| Verify-Pin | `6a9c4acd49bc458907e7` | `any` (pre-session) |
| Bartender-Sales | `bartender-sales` | `users` |

Teams: admin `68e35aed00144b8cde9d`, POS `68ffcecc0026f78f0af8`, PIN Payment Access
`6a9cbb1c95ea7d59dd8c`.

**Known gap:** long-pressing an item tile ("86 this") calls `Item-SetEnabled`, which executes for
the admin team only. On a PIN or POS-team session the server rejects it, but the till still grays
the tile out and still shows `Item disabled: <name>` — the change is local to that browser
session and does not persist. Only an admin Google login actually 86es an item for real. Use
Manage Items (admin only, hamburger menu) when it needs to stick.

---

## Live updates

`pos.js` subscribes to Appwrite Realtime on the config, events, items and categories collections:

- config or events change → alcohol gate re-resolved immediately;
- item or category change → catalog refreshed **only when the cart is empty**, otherwise the
  refresh is held and applied the moment the cart empties. An in-progress sale never has its
  prices change underneath it.

The Events realtime subscription is permission-gated the same way the old direct read was, so it
never fires for an anonymous PIN session — the 60-second poll is what actually keeps the alcohol
gate current on a till.

---

## Layout

```
src/
  App.js                     routes + the three auth guards
  components/
    login.js                 Google SSO button + Quick Access PIN dialog
    PinEntryDialog.js
    auth/AuthForm.js
    common/                  Alert, Buttons (PaymentMethodButtons, CheckoutButton),
                             Display (GiftcardDisplay), Modals (TransactionModals)
    pos/                     pos.js (the register), cart.js, item.js, category.js,
                             SplitPaymentPanel.js, salesReport.js, transactionsView.js,
                             manageItemsView.js, mySalesView.js
    selfCheckout/            the kiosk -- deliberately imports nothing from pos/ except cartItem
  utils/
    api.js                   Appwrite client, config, auth, reports
    checkout.js              creates the transaction, dispatches by method
    handleCardPayment.js     charge -> verify -> record, with the unconfirmed-charge latch
    stripe.js                Terminal discovery/connection, chargeCard, intent lifecycle
    splitPayment.js          recordPayment + retries + leg derivation for old transactions
    giftcard.js              lookup + planGiftcardLeg (the 51c floor)
    cartTotal.js             subtotal / discount / total, in cents
    barHours.js              isWithinBarHours
    cashTender.js  barcode.js  environment.js  pin.js  receipt.js  refund.js
    retryCheckout.js  transactionStatus.js  itemVisibility.js  format.js
```

Money is integer cents everywhere except the two cashier-typed input fields, which
`parseDollarsToCents` converts immediately.

Most of these files carry a header comment explaining *why* they are shaped the way they are,
usually naming the specific failure that shaped them. Read those before changing payment code.

## Testing

`npm test`. `MANUAL_TESTING.md` is the pre-event checklist for the things that need a real
reader, a real card and a real gift card in hand.
