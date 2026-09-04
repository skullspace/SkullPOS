# Migration Checklist

This checklist helps developers migrate existing components to use the new refactored structure.

## Phase 1: Component Extraction ✓

### Completed
- [x] Create AuthForm component
- [x] Create AlertNotification component
- [x] Create TransactionModals components
- [x] Create PaymentMethodButtons component
- [x] Create CheckoutButton component
- [x] Create GiftcardDisplay component

## Phase 2: Update Existing Components

### Login Component (`src/components/login.js`)
- [x] Use AuthForm component
- [x] Update variable names (formValues, errorMessage)
- [x] Update state management
- [x] Test login flow

### Register Component (`src/components/register.js`)
- [x] Use AuthForm component
- [x] Update variable names
- [x] Test registration flow

### POS Component (`src/components/pos/pos.js`)

#### Variable Renames
- [ ] `member_discount` → `memberDiscountPercentage`
- [ ] `member_discount_applied` → `memberDiscountApplied`
- [ ] `terminalReady` → `isTerminalReady`
- [ ] `transactionInProgress` → `isProcessing`
- [ ] `setTransactionInProgress` → `setProcessing`
- [ ] `checkoutSuccess` → `hasCheckoutSucceeded`
- [ ] `setCheckoutSuccess` → `setCheckoutSuccess` (rename state if needed)
- [ ] `checkoutError` → `checkoutErrorMessage`
- [ ] `setCheckoutError` → `setCheckoutError` (keep, used with message)
- [ ] `amountReceived` → `amountPaid`
- [ ] `setAmountReceived` → `setAmountPaid`
- [ ] `changeDue` → `changeAmount`
- [ ] `setChangeDue` → `setChangeAmount`
- [ ] `stripeAlert` → `notification`
- [ ] `setStripeAlert` → `setNotification`

#### Component Usage
- [ ] Replace `<Modals />` with individual modal components
- [ ] Use PaymentMethodButtons component
- [ ] Use CheckoutButton component
- [ ] Use GiftcardDisplay component
- [ ] Use AlertNotification component

#### Testing After Update
- [ ] Cart add/remove items
- [ ] Member discount applies correctly
- [ ] Stripe payment flow
- [ ] Cash payment flow
- [ ] Giftcard payment flow
- [ ] Hybrid payment (giftcard + card)
- [ ] Notifications display correctly
- [ ] Modals appear at correct times

### Cart Component (`src/components/pos/cart.js`)

#### Variable Renames
- [ ] `onAdd` → `onAddItem`
- [ ] `onRemove` → `onRemoveItem` (update call sites)
- [ ] `onIncrement` → `onIncrementQuantity`
- [ ] `onDecrement` → `onDecrementQuantity`
- [ ] `member_discount_applied` → `memberDiscountApplied`
- [ ] `amountReceived` → `amountPaid`
- [ ] `changeDue` → `changeAmount`
- [ ] `terminalReady` → `isTerminalReady`
- [ ] `transactionInProgress` → `isProcessing`

#### Component Usage
- [ ] Use PaymentMethodButtons component
- [ ] Use CheckoutButton component
- [ ] Use GiftcardDisplay component

#### Testing After Update
- [ ] Payment method buttons work
- [ ] Checkout button enables/disables correctly
- [ ] Giftcard display shows/hides
- [ ] Clear cart button works

### CartItem Component (`src/components/pos/cartItem.js`)

#### Variable Renames
- [ ] `onRemove` → `onRemoveItem`
- [ ] `onIncrement` → `onIncrementQuantity`
- [ ] `onDecrement` → `onDecrementQuantity`

#### Testing After Update
- [ ] Increment quantity button works
- [ ] Decrement quantity button works
- [ ] Remove item button works
- [ ] Total price calculation correct

### Category Component (`src/components/pos/category.js`)

#### Variable Renames
- [ ] `onAdd` → `onAddItem`

#### Testing After Update
- [ ] Items display correctly
- [ ] Add item button works

### Item Component (`src/components/pos/item.js`)

#### Variable Renames
- [ ] `onAdd` → `onAddItem`

#### Testing After Update
- [ ] Long-press disables item
- [ ] Single-click adds to cart
- [ ] Images display correctly
- [ ] Price shows correctly

### Modals Component (`src/components/pos/modals.js`)

#### Status: DEPRECATED
- [ ] Create backup of modals.js
- [ ] Replace all uses with TransactionModals
- [ ] Delete modals.js after verification
- [ ] Remove from imports

### SalesReport Component (`src/components/pos/salesReport.js`)

#### Variable Renames
- [ ] `loading` → `isLoading` (if applicable)

#### Testing After Update
- [ ] Date range selection works
- [ ] Report generates correctly
- [ ] Sorting works for all columns
- [ ] Numbers format correctly

## Phase 3: Update Utilities

### Cart Utils (`src/utils/cartUtils.js`)
- [x] Add comprehensive JSDoc comments
- [x] Document parameter types
- [x] Document return types

### Format Utils (`src/utils/format.js`)
- [x] Add comprehensive JSDoc comments
- [x] Document usage examples

### Barcode Utils (`src/utils/barcode.js`)
- [x] Add comprehensive JSDoc comments
- [x] Document factory function

### Checkout Utils (`src/utils/checkout.js`)
- [ ] Add comprehensive JSDoc comments
- [ ] Document state flow
- [ ] Add giftcard flow documentation

### Card Payment Utils (`src/utils/handleCardPayment.js`)
- [x] Add comprehensive JSDoc comments
- [ ] Update to use new variable names

### API Utils (`src/utils/api.js`)
- [x] Add comprehensive JSDoc comments
- [x] Document database structure
- [ ] Update error messages if needed

### Stripe Utils (`src/utils/stripe.js`)
- [ ] Update to use new variable names
- [ ] Add comprehensive JSDoc comments

## Phase 4: Documentation & Cleanup

### Documentation
- [x] Create REFACTORING_SUMMARY.md
- [x] Create REFACTORING_GUIDE.md
- [x] Create COMPONENT_LIBRARY.md
- [x] Update README.md
- [x] Create MIGRATION_CHECKLIST.md (this file)

### Code Cleanup
- [ ] Remove all console.log statements
- [ ] Remove debug comments
- [ ] Update eslint-disable comments
- [ ] Fix any TypeScript types if using TS

### Testing
- [ ] Run all unit tests
- [ ] Run all integration tests
- [ ] Test authentication flow
- [ ] Test all payment methods
- [ ] Test barcode scanning
- [ ] Test sales reporting
- [ ] Cross-browser testing
- [ ] Mobile responsiveness

### Performance
- [ ] Check component re-renders
- [ ] Verify memoization is working
- [ ] Check bundle size
- [ ] Verify lazy loading works

## Phase 5: Deployment

### Pre-deployment
- [ ] All tests passing
- [ ] No console errors
- [ ] No deprecated warnings
- [ ] Code review completed
- [ ] Documentation reviewed

### Deployment
- [ ] Build production bundle
- [ ] Deploy to staging
- [ ] Smoke test on staging
- [ ] Deploy to production
- [ ] Monitor error logs

### Post-deployment
- [ ] Verify all features working
- [ ] Monitor performance metrics
- [ ] Check user feedback
- [ ] Address any issues

## Quick Reference: Variable Mapping

### POS Component
```javascript
// OLD → NEW
member_discount → memberDiscountPercentage
member_discount_applied → memberDiscountApplied
terminalReady → isTerminalReady
transactionInProgress → isProcessing
checkoutSuccess → hasCheckoutSucceeded
checkoutError → checkoutErrorMessage
amountReceived → amountPaid
changeDue → changeAmount
stripeAlert → notification
```

### Cart & Item Components
```javascript
// OLD → NEW
onAdd → onAddItem
onRemove → onRemoveItem
onIncrement → onIncrementQuantity
onDecrement → onDecrementQuantity
```

## Rollback Plan

If issues occur during migration:

1. **Before each phase:** Create a git branch
   ```bash
   git checkout -b refactor/phase-{number}
   ```

2. **After successful testing:** Merge to main
   ```bash
   git merge --ff-only refactor/phase-{number}
   ```

3. **If issues found:** Revert and fix
   ```bash
   git revert {commit-hash}
   git checkout -- .
   ```

## Support & Questions

- Check COMPONENT_LIBRARY.md for component usage
- Review REFACTORING_GUIDE.md for detailed info
- Look at component JSDoc comments
- Check git history for similar changes
- Ask in team channels

## Progress Tracking

Update this as you complete tasks:

- [ ] **Phase 1:** Components extraction - **IN PROGRESS**
- [ ] **Phase 2:** Update existing components - **NOT STARTED**
- [ ] **Phase 3:** Update utilities - **NOT STARTED**
- [ ] **Phase 4:** Documentation & cleanup - **NOT STARTED**
- [ ] **Phase 5:** Deployment - **NOT STARTED**

---

**Last Updated:** September 3, 2026
**Created by:** AI Assistant
