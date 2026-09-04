/**
 * REFACTORING_GUIDE.md - Project Refactoring Documentation
 * 
 * This document outlines the refactoring done to improve code organization,
 * component reusability, and variable naming conventions.
 */

# SkullPOS Refactoring Guide

## Project Structure Changes

### New Folder Organization

```
src/
├── components/
│   ├── auth/                          # NEW: Authentication components
│   │   └── AuthForm.js               # Reusable auth form (login/register)
│   ├── common/                        # NEW: Shared reusable components
│   │   ├── Alert/
│   │   │   └── Alert.js              # Notification/alert component
│   │   └── Modals/
│   │       └── TransactionModals.js  # Transaction-related modals
│   ├── pos/
│   │   ├── pos.js                    # Main POS component
│   │   ├── cart.js                   # Shopping cart display
│   │   ├── cartItem.js               # Individual cart item
│   │   ├── category.js               # Product category display
│   │   ├── item.js                   # Individual product item
│   │   ├── modals.js                 # DEPRECATED - use TransactionModals
│   │   └── salesReport.js            # Sales analytics
│   ├── login.js                      # Login (now uses AuthForm)
│   └── register.js                   # Register (now uses AuthForm)
├── utils/
│   ├── api.js                        # Appwrite API integration
│   ├── barcode.js                    # Barcode scanning logic
│   ├── cartUtils.js                  # Cart state management
│   ├── checkout.js                   # Checkout flow
│   ├── format.js                     # Formatting utilities
│   ├── handleCardPayment.js          # Card payment handler
│   └── stripe.js                     # Stripe integration
├── App.js                            # Root app component
└── index.js                          # Entry point
```

## Variable Naming Conventions

### Refactoring Summary

| Old Name | New Name | Component | Notes |
|----------|----------|-----------|-------|
| `member_discount_applied` | `memberDiscountApplied` | pos.js | Camel case convention |
| `terminalReady` | `isTerminalReady` | pos.js | Boolean prefix "is" |
| `transactionInProgress` | `isProcessing` | pos.js | Clearer intent |
| `setTransactionInProgress` | `setProcessing` | pos.js | Matches state name |
| `checkoutSuccess` | `hasCheckoutSucceeded` | pos.js | Boolean prefix "has" |
| `checkoutError` | `checkoutErrorMessage` | pos.js | More descriptive |
| `setCheckoutError` | `setCheckoutError` | pos.js | Used with string message |
| `amountReceived` | `amountPaid` | pos.js, modals.js | Clearer context |
| `setAmountReceived` | `setAmountPaid` | pos.js, modals.js | Matches state name |
| `changeDue` | `changeAmount` | pos.js, modals.js | More descriptive |
| `setChangeDue` | `setChangeAmount` | pos.js, modals.js | Matches state name |
| `stripeAlert` | `notification` | pos.js, stripe.js | More generic |
| `setStripeAlert` | `setNotification` | pos.js, stripe.js | Matches state name |
| `member_discount` | `memberDiscountPercentage` | pos.js | More descriptive |
| `onAdd` | `onAddItem` | cart.js, item.js | More specific |
| `onRemove` | `onRemoveItem` | cart.js, cartItem.js | More specific |
| `onIncrement` | `onIncrementQuantity` | cart.js, cartItem.js | More specific |
| `onDecrement` | `onDecrementQuantity` | cart.js, cartItem.js | More specific |

## Reusable Components

### 1. AuthForm Component
**Location:** `src/components/auth/AuthForm.js`

A reusable authentication form component used by both Login and Register.

**Benefits:**
- Eliminates code duplication
- Easy to extend with new fields
- Consistent styling and behavior
- Flexible configuration

**Usage:**
```jsx
<AuthForm
  title="Login"
  fields={[
    { name: "email", label: "Email", type: "email" },
    { name: "password", label: "Password", type: "password" }
  ]}
  values={formValues}
  onFieldChange={handleFieldChange}
  errorMessage={errorMessage}
  onSubmit={handleLogin}
  submitButtonLabel="Login"
  secondaryActions={[...]}
/>
```

### 2. AlertNotification Component
**Location:** `src/components/common/Alert/Alert.js`

Reusable notification component replacing inline `<Alert>` components.

**Benefits:**
- Consistent alert styling
- Auto-dismiss functionality
- Used throughout app

### 3. TransactionModals Components
**Location:** `src/components/common/Modals/TransactionModals.js`

Separate modal components for:
- `ProcessingModal` - Transaction in progress
- `ErrorModal` - Checkout errors
- `CashPaymentModal` - Cash payment input
- `SuccessModal` - Successful checkout

**Benefits:**
- Organized modal management
- Reusable across different payment flows
- Easier to maintain and test

## Migration Guide

### For Components Using Old Variable Names

Search and replace patterns:

1. **In pos.js:**
   ```
   terminalReady → isTerminalReady
   transactionInProgress → isProcessing
   setTransactionInProgress → setProcessing
   checkoutSuccess → hasCheckoutSucceeded
   checkoutError → checkoutErrorMessage
   amountReceived → amountPaid
   changeDue → changeAmount
   stripeAlert → notification
   setStripeAlert → setNotification
   member_discount_applied → memberDiscountApplied
   member_discount → memberDiscountPercentage
   ```

2. **In modal components (modals.js → TransactionModals.js):**
   Replace old modals.js with import from `TransactionModals.js`

3. **In cart and item components:**
   ```
   onAdd → onAddItem
   onRemove → onRemoveItem
   onIncrement → onIncrementQuantity
   onDecrement → onDecrementQuantity
   ```

## Testing Refactored Components

### Unit Testing
- AuthForm accepts various field configurations
- Alert component shows/hides correctly
- Modal components render with correct state

### Integration Testing
- Login/Register flow works end-to-end
- POS cart operations work correctly
- Payment flows complete successfully

## Next Steps

1. Complete migration of remaining components
2. Update all import statements
3. Test all payment flows (Stripe, Cash, Giftcard)
4. Remove deprecated modals.js file
5. Update documentation in each component
