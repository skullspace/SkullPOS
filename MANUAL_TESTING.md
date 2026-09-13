# Pre-event checklist

Run this before doors. It is everything that needs a real reader, a real card and a real gift
card in hand — the arithmetic, the idempotency and the permission rules are already covered by
`npm test` (24 files, 261 tests) and by `AppwriteFunctions`' own suite. Run those first if you
have changed code; this document is for what they can't reach.

**Where to run it.** Do the full rehearsal (§2–§6) on **https://uat.skullpos.shotty.tech**, not
on the live till. UAT is a test environment (`src/utils/environment.js`): Stripe test keys, and
every transaction written `testing: true`, so nothing here lands in real sales figures or on a
real customer's card. Then do §1 and §7 on the actual production till.

**What you need**

- The till, on the venue WiFi, with the Stripe reader powered up and on the same network.
- A Stripe **test** card for UAT, and a real card for the production check in §7.
- A **second** physical test card — §5 needs two different cards on one sale.
- A test gift card with a known balance you are allowed to drain (note the balance before you
  start, and check it again after) and its barcode.
- A login for the tier you are testing. Refunds (§6) need an **admin** Google account; a PIN or
  POS-team login has no refund button, and the server refuses it anyway.

Tick as you go. Anything that doesn't match, stop and note the exact message on screen — the
error text is written to be specific, and the specific words matter.

---

## 1. The till comes up (5 minutes, on the real till)

- [ ] Load the app. If you get the login screen, sign in with your `@skullspace.ca` Google
      account, or use **Quick Access PIN**. A bartender PIN only works within an hour either
      side of that bartender's own event — if it is rejected outside the window, that is correct
      behaviour, not a broken PIN.
- [ ] Do **not** guess at PINs. Five wrong attempts inside a 15-minute window locks PIN entry on
      that till until the window passes, with a "try again in N minutes" message.
- [ ] Hamburger menu → **Select Terminal**, pick the reader. The Card button in the cart is
      greyed with a "Terminal not ready" tooltip until it connects, and lights up once it does.
      That button is the connection status — you don't need to check anything else.
- [ ] Tap a couple of items. The reader's own screen should mirror the cart lines and total.
      Clear the cart; the reader display clears.
- [ ] Check prices on a few tiles against what they should be. The till charges `sale_price`
      from `pos_items`; the customer menu board can be showing a different number if someone set
      `self_pricing` on an item — if the board and the till disagree, the till is right and the
      board needs fixing.
- [ ] Check the alcohol gate — see §7 below. Do this **before** doors, not when the first
      customer asks for a beer.

## 2. A card sale

- [ ] Add items. Leave the payment method on **Card**. Tap **Checkout**.
- [ ] "Processing Transaction" comes up with a **Cancel** button. Tap the card on the reader.
- [ ] Add a tip on the reader if it offers one — do this at least once, it exercises a
      different code path.
- [ ] Success alert reads `Payment Successful: <amount captured> Total: <sale total> + Tip:
      <tip>`. The captured amount is total + tip; the sale total is the base. Both numbers being
      the same when you added a tip is a bug.
- [ ] Cart clears, "Checkout Successful" modal appears.
- [ ] In the Stripe **test** dashboard: one payment for total + tip, and its metadata carries a
      `transactionId`. No metadata means the sale could never have been recorded — stop and
      raise it.

## 3. A cash sale with change

- [ ] Ring up something with an awkward total (e.g. $7.25). Choose **Cash**, tap **Checkout**.
- [ ] The cash modal offers **Exact ($7.25)** plus whichever of $5 / $10 / $20 / $50 / $100
      actually covers it — a $7.25 sale must not offer a $5 button.
- [ ] Type an under-payment first. It shows `Still needed: $x.xx` in red, and Submit is refused
      with "Amount received is less than total".
- [ ] Now tap **$10**. It previews `Change due: $2.75`.
- [ ] Submit. "Checkout Successful" shows **Change Due: $2.75**. Count it out.
- [ ] Ring a second, unrelated **card** sale immediately after. Its success modal must show
      **no** change line. (A stale change figure bleeding onto the next sale is a bug that has
      happened before.)
- [ ] Note: only the sale total is recorded server-side. The tendered amount and the change are
      cashier-facing figures and are not stored — the drawer is reconciled against the sale
      total, not against what was handed over.

## 4. A gift card sale

Note the card's starting balance before you begin.

**Fully covered:**

- [ ] Ring up less than the balance. Scan the gift card (or hamburger → **Manual UPC**). A
      "Giftcard loaded" alert appears and the cart shows the masked card id and its balance.
- [ ] Tap **Checkout**. The sale completes **without the reader being touched at all**.
- [ ] Check the real balance afterwards: down by exactly the sale total.

**Partially covered:**

- [ ] Ring up more than the remaining balance, load the card, Checkout.
- [ ] The cart shows `Applied $x.xx -- $y.yy remaining on card`, then the reader is asked for
      exactly `$y.yy` — not the full total.
- [ ] Gift card balance goes to 0, the card is charged the remainder, sale completes.

**The awkward remainder** (this is the one worth doing deliberately):

- [ ] Arrange a sale where the balance leaves between 1c and 50c to charge — e.g. a $4.50 card
      against a $4.88 sale.
- [ ] Expected: the gift card leg is capped so the card remainder is at least 51c (Stripe's
      floor), and the sale goes through. The few cents left on the gift card are shown in the
      applied/remaining line.
- [ ] If the sale is too small for any chargeable split to exist, you get a refusal naming the
      amount and telling you to take it in cash — **before** anything is debited. Confirm the
      gift card's balance is untouched.

**DJ voucher** (a gift card scoped to one event, if you have one):

- [ ] It is refused outside its own event, refused if revoked, and can't be combined with a
      discount. If the red "Alcohol gate unavailable" chip is showing, vouchers are refused too —
      that is correct; fix the gate first.

## 5. A split payment

- [ ] Ring up something over $20. Tap **Split Payment**, then **Checkout**.
- [ ] The panel shows `$X left`. Add a **Cash** leg for part of it → a chip appears for that leg
      and the remaining figure drops by exactly that much.
- [ ] Add a **Card** leg for the rest. The reader is asked for the remainder only.
- [ ] At zero remaining the sale completes and the cart clears.
- [ ] **Two physical cards:** repeat with two Card legs, one per card. Two separate payments in
      the Stripe dashboard, each for its own sub-amount.
- [ ] **Over-applying a leg is refused:** with $5 left, try to add a $10 cash leg. "Enter an
      amount up to $5.00", nothing recorded, remaining unchanged.
- [ ] **Backing out with money already taken:** add one leg, then **Back to normal checkout**.
      You get a confirmation naming what has been taken and warning that gift card legs are
      credited back and cash legs voided. Confirm it, then verify: transaction `cancelled`, gift
      card balance restored, and hand back any cash you took.

## 6. A refund (admin login required)

- [ ] Hamburger → **Transactions**. Header reads "Transactions (last 24 hours)". Expand one of
      the sales you just rang.
- [ ] The expanded row lists each payment leg separately — a split sale shows "Cash (leg 1)",
      "Card (leg 2)" and so on, summing to the total. A single-method sale shows one line.
- [ ] Tap **Refund**. The confirmation dialog lists every leg again, with cash legs marked
      **(hand back physically)**. Read it before confirming — this list is what will actually be
      reversed.
- [ ] Confirm. Status flips to `refunded`.
  - Cash-only sale: marked refunded, nothing external happens, you hand back the cash.
  - Card sale: a refund for the exact amount in the Stripe test dashboard.
  - Gift card + card split: gift card credited back by its leg amount (check the real balance),
    Stripe refund for the card leg only.
- [ ] Try to refund the same transaction again. Refused — no second Stripe refund, no double
      credit.
- [ ] Also confirm a refund of an **old** transaction (one from before split payments, with no
      `payments` field) still lists sensible legs rather than blanks.

## 7. The alcohol gate (do this on the real till, before doors)

Alcohol shows on the grid only when all five of these are true:

1. `Ticketing-ActiveEvent` answered and there is an event running now;
2. that event has **sells alcohol** ticked;
3. the current time is inside its **bar open / bar close** window (an overnight window like
   18:00–02:00 is handled);
4. the admin kill switch `alcohol_override_disabled` is off;
5. the local **Hide alcohol items** toggle in the hamburger menu is off.

- [ ] If the event is meant to serve alcohol tonight: alcohol categories and items are on the
      grid. If they aren't, work down that list — the most common cause is bar hours not set on
      the event, or set for the wrong times.
- [ ] If tonight is dry, or you are before bar open: alcohol is absent. That is correct.
- [ ] **No red chip above the item grid.** A red `Alcohol gate unavailable — …` chip means we
      could not establish an answer, so alcohol is hidden and DJ vouchers are refused — this is
      not the same as the bar being shut. The chip says which half failed (can't reach the event
      service / the event service isn't reporting bar hours / can't read the override setting).
      Fix it before doors; it will not resolve itself at the bar.
- [ ] The gate re-checks every 60 seconds. If an admin changes bar hours or flips the override
      mid-event, the grid should follow within a minute without a reload — worth confirming once
      per season if an admin is available to toggle it.
- [ ] Alcohol already in a cart is only pulled back out when the gate is *known* to disallow it
      (e.g. bar close passes mid-sale), never because a lookup timed out.

## 8. Self-checkout kiosk, if you're running one

- [ ] Log the kiosk in with the **kiosk** PIN — it lands on `/self-checkout`, and typing `/pos`
      does not get you to the register.
- [ ] Card is the only payment path anywhere in the kiosk UI. No cash, no gift card, no split.
- [ ] No alcohol anywhere on the kiosk grid, regardless of the event or bar hours.
- [ ] Add items and leave it alone for 90 seconds — the cart clears itself so the next customer
      doesn't inherit a stranger's order.
- [ ] After a purchase, the success screen offers an email receipt field. Send one and confirm
      it arrives.
- [ ] The reader mirrors the kiosk cart the same way it mirrors the register's.
- [ ] "Pay Membership Dues" only exists on localhost and UAT. If you can see that button on
      `skullpos.shotty.tech`, the environment check is broken — raise it.

## 9. If something goes wrong mid-sale

Two error states mean **real money moved and the sale has no record of it**. Both look the same
from behind the counter: the cart clears, the error modal has no Retry button, and the
transaction stays `pending` in the Transactions view.

- **"Card was charged $X … do not charge again"** — the charge is real. The message names the
  Stripe payment id. Do not re-ring the sale. Reconcile against Stripe.
- **"…the gift card balance may ALREADY have been reduced by $X"** — check the card's real
  balance before applying it again.

In both cases the transaction is left `pending` **on purpose** so it can be found and fixed. Do
not cancel it to tidy the list.

Everything else — a decline, a reader that dropped, a network blip before the reader was tapped
— is safe to retry from the error modal. If Retry is on screen, nothing has been taken.

---

## Notes for whoever updates this file

Every step above describes what the code actually does today. If you change payment behaviour,
change the step with it — a checklist that describes last season's till is worse than no
checklist, because someone will tick it.
