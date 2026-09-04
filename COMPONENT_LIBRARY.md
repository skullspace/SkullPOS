# SkullPOS Component Library

This document describes the new reusable components extracted during refactoring.

## Authentication Components

### AuthForm
**Path:** `src/components/auth/AuthForm.js`

Reusable authentication form component used for both Login and Register screens.

**Props:**
- `title` (string): Form title
- `fields` (Array<Object>): Form field configurations
  - `name` (string): Field name
  - `label` (string): Field label
  - `type` (string): Input type (text, email, password)
- `values` (Object): Current field values
- `onFieldChange` (Function): Callback for field changes
- `errorMessage` (string): Error message to display
- `onSubmit` (Function): Form submission handler
- `submitButtonLabel` (string): Label for submit button
- `secondaryActions` (Array): Secondary button configurations
  - `label` (string): Button label
  - `onClick` (Function): Click handler

**Example Usage:**
```jsx
const [formValues, setFormValues] = useState({ email: "", password: "" });

<AuthForm
  title="Login"
  fields={[
    { name: "email", label: "Email", type: "email" },
    { name: "password", label: "Password", type: "password" }
  ]}
  values={formValues}
  onFieldChange={(name, value) => 
    setFormValues(prev => ({ ...prev, [name]: value }))
  }
  errorMessage={errorMessage}
  onSubmit={handleLogin}
  submitButtonLabel="Login"
  secondaryActions={[
    { label: "Register", onClick: () => navigate("/register") }
  ]}
/>
```

## Alert & Notification Components

### AlertNotification
**Path:** `src/components/common/Alert/Alert.js`

Reusable notification/alert component with auto-dismiss.

**Props:**
- `isOpen` (boolean): Whether alert is visible
- `message` (string): Alert message text
- `severity` (string): Alert type ('success', 'error', 'warning', 'info')
- `onClose` (Function): Callback when alert closes

**Example Usage:**
```jsx
<AlertNotification
  isOpen={notification.active}
  message={notification.message}
  severity={notification.type}
  onClose={() => setNotification({ ...notification, active: false })}
/>
```

## Modal Components

### TransactionModals
**Path:** `src/components/common/Modals/TransactionModals.js`

Exports four modal components for transaction handling:

#### ProcessingModal
Shows while transaction is in progress.

**Props:**
- `isProcessing` (boolean): Whether modal should show
- `paymentMethod` (string): Current payment method
- `onCancel` (Function): Cancel payment callback

#### ErrorModal
Shows when checkout fails.

**Props:**
- `isOpen` (boolean): Whether modal should show
- `errorMessage` (string): Error message
- `isRetrying` (boolean): Whether retry is in progress
- `onRetry` (Function): Retry callback
- `onClose` (Function): Close callback

#### CashPaymentModal
Collects cash amount from user.

**Props:**
- `isOpen` (boolean): Whether modal should show
- `amountPaid` (string): Current amount entered
- `onAmountChange` (Function): Amount change handler
- `onSubmit` (Function): Submit handler
- `onClose` (Function): Close callback
- `isProcessing` (boolean): Whether processing

#### SuccessModal
Shows after successful checkout.

**Props:**
- `isOpen` (boolean): Whether modal should show
- `changeAmount` (number): Change due (in cents)
- `formatCAD` (Function): Currency formatter
- `onClose` (Function): Close callback
- `onClearCart` (Function): Clear cart callback

**Example Usage:**
```jsx
import { ProcessingModal, ErrorModal, CashPaymentModal, SuccessModal } 
  from "../../common/Modals/TransactionModals";

<ProcessingModal
  isProcessing={isProcessing}
  paymentMethod={paymentMethod}
  onCancel={handleCancel}
/>
<ErrorModal
  isOpen={hasError}
  errorMessage={errorMessage}
  isRetrying={isRetrying}
  onRetry={handleRetry}
  onClose={handleCloseError}
/>
```

## Button Components

### PaymentMethodButtons
**Path:** `src/components/common/Buttons/PaymentMethodButtons.js`

Payment method selector with Card, Cash, and Member Discount buttons.

**Props:**
- `currentMethod` (string): Currently selected method
- `onMethodChange` (Function): Payment method change handler
- `isTerminalReady` (boolean): Stripe terminal ready status
- `isMemberDiscountApplied` (boolean): Discount applied status
- `onToggleMemberDiscount` (Function): Discount toggle handler
- `isProcessing` (boolean): Transaction in progress

**Example Usage:**
```jsx
<PaymentMethodButtons
  currentMethod={paymentMethod}
  onMethodChange={setPaymentMethod}
  isTerminalReady={isTerminalReady}
  isMemberDiscountApplied={memberDiscountApplied}
  onToggleMemberDiscount={setMemberDiscountApplied}
  isProcessing={isProcessing}
/>
```

### CheckoutButton
**Path:** `src/components/common/Buttons/CheckoutButton.js`

Checkout button with clear cart action.

**Props:**
- `cartItemCount` (number): Number of items in cart
- `isTerminalReady` (boolean): Stripe terminal ready status
- `paymentMethod` (string): Current payment method
- `onCheckout` (Function): Checkout handler
- `onClearCart` (Function): Clear cart handler
- `isProcessing` (boolean): Transaction in progress

**Example Usage:**
```jsx
<CheckoutButton
  cartItemCount={cart.length}
  isTerminalReady={isTerminalReady}
  paymentMethod={paymentMethod}
  onCheckout={handleCheckout}
  onClearCart={handleClearCart}
  isProcessing={isProcessing}
/>
```

## Display Components

### GiftcardDisplay
**Path:** `src/components/common/Display/GiftcardDisplay.js`

Displays loaded giftcard information with balance.

**Props:**
- `giftcard` (Object|null): Giftcard object with `dj` (ID) and `balance`
- `onClear` (Function): Clear giftcard callback
- `isProcessing` (boolean): Transaction in progress

**Features:**
- Masks giftcard ID (shows only last 8 characters)
- Displays balance in CAD format
- Disables during processing

**Example Usage:**
```jsx
<GiftcardDisplay
  giftcard={currentGiftcard}
  onClear={handleClearGiftcard}
  isProcessing={isProcessing}
/>
```

## Migration Instructions

### Converting from old modals.js
Replace:
```jsx
import Modals from "./modals";
<Modals {...props} />
```

With:
```jsx
import { ProcessingModal, ErrorModal, CashPaymentModal, SuccessModal } 
  from "../common/Modals/TransactionModals";

<ProcessingModal {...props} />
<ErrorModal {...props} />
<CashPaymentModal {...props} />
<SuccessModal {...props} />
```

### Converting from old auth forms
Replace individual form JSX with:
```jsx
import AuthForm from "./auth/AuthForm";
<AuthForm {...config} />
```

### Converting button implementations
Replace inline button JSX with:
```jsx
import PaymentMethodButtons from "../common/Buttons/PaymentMethodButtons";
import CheckoutButton from "../common/Buttons/CheckoutButton";

<PaymentMethodButtons {...props} />
<CheckoutButton {...props} />
```

## Component Dependencies

### Import Map
```
AlertNotification
├── @mui/material (Alert, Collapse)

AuthForm
├── @mui/material (Box, Button, Input, Typography, FormControl, FormLabel)

TransactionModals
├── @mui/material (Box, Button, Modal, CircularProgress, TextField, Typography)

PaymentMethodButtons
├── @mui/material (Box, Button, Tooltip)
├── @mui/icons-material (CreditCardIcon, MoneyIcon)

CheckoutButton
├── @mui/material (Box, Button, Tooltip, IconButton)
├── @mui/icons-material (CheckoutIcon, DeleteIcon)

GiftcardDisplay
├── @mui/material (Box, Button)
├── utils/format (formatCAD)
```

## Best Practices

1. **Props Validation**: All components should validate required props
2. **Accessibility**: Use ARIA labels for all interactive elements
3. **Disabled States**: Show clear feedback when buttons are disabled
4. **Tooltips**: Provide helpful tooltips for disabled states
5. **Loading States**: Display loading indicators during async operations
6. **Error Handling**: Gracefully handle missing or invalid data

## Testing Checklist

- [ ] All form fields accept and update values
- [ ] Error messages display correctly
- [ ] Modal visibility toggles work
- [ ] Button click handlers are called
- [ ] Disabled states are applied correctly
- [ ] Tooltips display on hover
- [ ] Components handle null/undefined props
- [ ] Formatting functions work correctly
