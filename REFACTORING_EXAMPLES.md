# Refactoring Examples

This document shows before/after code examples for common refactoring patterns.

## 1. Authentication Form

### Before: Login Component (Duplicated Form)

```jsx
// src/components/login.js
import React, { useState } from "react";
import { Box, Button, Input, Typography, FormControl, FormLabel } from "@mui/material";

const Login = () => {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");

	const handleLogin = async (e) => {
		e.preventDefault();
		try {
			await login(email, password);
			navigate("/pos");
		} catch (err) {
			setError(err.message);
		}
	};

	return (
		<Box sx={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
			<Typography>Login</Typography>
			<form>
				<FormControl>
					<FormLabel>Email</FormLabel>
					<Input value={email} onChange={(e) => setEmail(e.target.value)} />
				</FormControl>
				<FormControl>
					<FormLabel>Password</FormLabel>
					<Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
				</FormControl>
				{error && <Typography color="error">{error}</Typography>}
				<Button onClick={handleLogin}>Login</Button>
				<Button onClick={() => navigate("/register")}>Register</Button>
			</form>
		</Box>
	);
};
```

### After: Using AuthForm Component

```jsx
// src/components/login.js
import React, { useState } from "react";
import { useAppwrite } from "../utils/api";
import { useNavigate } from "react-router-dom";
import AuthForm from "./auth/AuthForm";

const Login = () => {
	const { login } = useAppwrite();
	const navigate = useNavigate();
	const [formValues, setFormValues] = useState({ email: "", password: "" });
	const [errorMessage, setErrorMessage] = useState("");

	const handleFieldChange = (fieldName, value) => {
		setFormValues(prev => ({ ...prev, [fieldName]: value }));
	};

	const handleLogin = async (e) => {
		e.preventDefault();
		try {
			await login(formValues.email, formValues.password);
			setErrorMessage("");
			navigate("/pos");
		} catch (err) {
			setErrorMessage(err.message || "Login failed");
		}
	};

	return (
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
			secondaryActions={[
				{ label: "Register", onClick: () => navigate("/register") }
			]}
		/>
	);
};
```

**Benefits:**
- ✅ 50% less code
- ✅ No form duplication
- ✅ Easy to customize
- ✅ Consistent styling

---

## 2. Modals Organization

### Before: All Modals in One Component

```jsx
// src/components/pos/modals.js
const Modals = ({ 
	cashModalOpen, setCashModalOpen, 
	checkoutSuccess, setCheckoutSuccess,
	checkoutError, setCheckoutError,
	// ... 15+ more props
}) => {
	if (transactionInProgress) {
		return <Modal>{ /* Processing modal */ }</Modal>;
	}
	if (checkoutError) {
		return <Modal>{ /* Error modal */ }</Modal>;
	}
	if (cashModalOpen) {
		return <Modal>{ /* Cash modal */ }</Modal>;
	}
	if (checkoutSuccess) {
		return <Modal>{ /* Success modal */ }</Modal>;
	}
	return null;
};
```

### After: Separated Modal Components

```jsx
// src/components/common/Modals/TransactionModals.js
export { ProcessingModal, ErrorModal, CashPaymentModal, SuccessModal };

// Usage in pos.js:
<ProcessingModal 
	isProcessing={isProcessing}
	paymentMethod={paymentMethod}
	onCancel={handleCancel}
/>
<ErrorModal
	isOpen={hasError}
	errorMessage={checkoutErrorMessage}
	isRetrying={isRetrying}
	onRetry={handleRetry}
	onClose={handleCloseError}
/>
<CashPaymentModal
	isOpen={cashModalOpen}
	amountPaid={amountPaid}
	onAmountChange={setAmountPaid}
	onSubmit={handleCashPayment}
	onClose={() => setCashModalOpen(false)}
	isProcessing={isProcessing}
/>
<SuccessModal
	isOpen={hasCheckoutSucceeded}
	changeAmount={changeAmount}
	formatCAD={formatCAD}
	onClose={() => setCheckoutSuccess(false)}
	onClearCart={handleClearCart}
/>
```

**Benefits:**
- ✅ Each modal independently manageable
- ✅ Easier to test
- ✅ Clearer prop passing
- ✅ Better separation of concerns

---

## 3. Variable Naming Cleanup

### Before: Inconsistent Names

```jsx
// In pos.js
const member_discount_applied = true;  // snake_case
const terminalReady = false;           // camelCase
const transactionInProgress = true;    // descriptive but unclear
const checkoutError = "Card declined"; // confused as boolean/string
const amountReceived = 100;            // ambiguous context
const stripeAlert = alert;             // too specific to payment

// Usage is confusing:
if (checkoutError) { /* might be truthy string */ }
if (terminalReady) { /* different naming style */ }
if (member_discount_applied) { /* snake_case inconsistency */ }
```

### After: Consistent, Clear Names

```jsx
// In pos.js
const memberDiscountApplied = true;      // camelCase consistently
const isTerminalReady = false;           // boolean "is" prefix
const isProcessing = true;               // clearer intent
const checkoutErrorMessage = "...";      // clearly a string message
const amountPaid = 100;                  // clearer context
const notification = { ...};             // generic, reusable name

// Usage is crystal clear:
if (checkoutErrorMessage) { /* definitely a string */ }
if (isTerminalReady) { /* clearly a boolean */ }
if (memberDiscountApplied) { /* consistent camelCase */ }
if (isProcessing) { /* clear what's processing */ }
```

**Benefits:**
- ✅ Consistent style throughout codebase
- ✅ Boolean "is" prefix immediately signals boolean type
- ✅ Clearer intent and usage
- ✅ Easier for new developers to understand

---

## 4. Payment Method Buttons

### Before: Buttons in Cart Component

```jsx
// In cart.js - mixed with cart logic
return (
	<Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr", gap: 0.5 }}>
		<Button
			variant={paymentMethod === "stripe" ? "outlined" : "contained"}
			disabled={!terminalReady || transactionInProgress}
			onClick={() => setPaymentMethod("stripe")}
		>
			Card
		</Button>
		<Button
			variant={paymentMethod === "cash" ? "outlined" : "contained"}
			onClick={() => setPaymentMethod("cash")}
		>
			Cash
		</Button>
		<Button
			variant={memberDiscountApplied ? "outlined" : "contained"}
			onClick={() => applyMemberDiscount(!memberDiscountApplied)}
		>
			Member Discount
		</Button>
	</Box>
);
```

### After: Reusable Component

```jsx
// In cart.js - cleaner, focused on cart data
import PaymentMethodButtons from "../common/Buttons/PaymentMethodButtons";

return (
	<PaymentMethodButtons
		currentMethod={paymentMethod}
		onMethodChange={setPaymentMethod}
		isTerminalReady={isTerminalReady}
		isMemberDiscountApplied={memberDiscountApplied}
		onToggleMemberDiscount={setMemberDiscountApplied}
		isProcessing={isProcessing}
	/>
);
```

**Benefits:**
- ✅ Cart component is simpler and focused
- ✅ Button logic is reusable elsewhere
- ✅ Easier to test buttons independently
- ✅ Cleaner prop interface

---

## 5. Alert Notifications

### Before: Inline Alert in pos.js

```jsx
// In pos.js - cluttered with many concerns
<Collapse in={stripeAlert.active}>
	<Alert
		variant="filled"
		onClose={() => setStripeAlert({
			active: false,
			message: "",
			type: "info",
		})}
		severity={stripeAlert.type}
	>
		{stripeAlert.message}
	</Alert>
</Collapse>
```

### After: Reusable Component

```jsx
// In pos.js - cleaner
import AlertNotification from "../common/Alert/Alert";

<AlertNotification
	isOpen={notification.active}
	message={notification.message}
	severity={notification.type}
	onClose={() => setNotification({ ...notification, active: false })}
/>
```

**Benefits:**
- ✅ pos.js is cleaner and more readable
- ✅ Alert styling is consistent
- ✅ Easy to add new notification types
- ✅ Reusable in other components

---

## 6. Giftcard Display

### Before: Inline in cart.js

```jsx
// In cart.js - mixed with other cart display logic
{giftcard && (
	<Box sx={{ mb: 1, display: "flex", justifyContent: "space-between" }}>
		<div>
			<strong>Giftcard:</strong> {
				(() => {
					const id = giftcard.dj || "";
					if (id.length <= 8) return id;
					return "****" + id.slice(-8);
				})()
			}
			<div>Balance: {formatCAD(giftcard.balance || 0)}</div>
		</div>
		<Button size="small" onClick={onClearGiftcard} disabled={transactionInProgress}>
			Clear Giftcard
		</Button>
	</Box>
)}
```

### After: Reusable Component

```jsx
// In cart.js - focused on cart layout
import GiftcardDisplay from "../common/Display/GiftcardDisplay";

<GiftcardDisplay
	giftcard={currentGiftcard}
	onClear={handleClearGiftcard}
	isProcessing={isProcessing}
/>
```

**Benefits:**
- ✅ Masking logic isolated in component
- ✅ Cleaner cart display logic
- ✅ Reusable if giftcard display needed elsewhere
- ✅ Easier to test and maintain

---

## 7. Function Parameter Naming

### Before: Unclear Intent

```jsx
// cart.js - props are unclear
<CartItem
	cartItem={item}
	onRemove={removeItemFromCart}
	onIncrement={addItemToCart}
	onDecrement={removeItemFromCart}
/>

// Callbacks in pos.js
const removeItemFromCart = (itemId, all = false) => { /* ... */ };
const addItemToCart = (itemId) => { /* ... */ };

// Confusing: are onRemove and onDecrement the same?
// addItemToCart used for increment?
```

### After: Clear, Descriptive Names

```jsx
// cart.js - props are crystal clear
<CartItem
	cartItem={item}
	onRemoveItem={removeItem}
	onIncrementQuantity={incrementQuantity}
	onDecrementQuantity={decrementQuantity}
/>

// Callbacks in pos.js - intent is obvious
const removeItem = (itemId, all = false) => { /* ... */ };
const incrementQuantity = (itemId) => { /* ... */ };
const decrementQuantity = (itemId) => { /* ... */ };

// Now each handler has a clear, specific purpose
```

**Benefits:**
- ✅ Intent is immediately obvious
- ✅ No confusion about what callback does what
- ✅ Easier code reviews
- ✅ Faster onboarding for new developers

---

## Summary of Patterns

| Pattern | Before | After | Benefit |
|---------|--------|-------|---------|
| **Forms** | Duplicated code | AuthForm component | 50% less code |
| **Modals** | One giant component | Separate components | Cleaner, testable |
| **Variables** | Inconsistent naming | Consistent style | Easier to understand |
| **Buttons** | Inline in parent | Reusable component | Focused, testable |
| **Alerts** | Inline in parent | AlertNotification | Consistent styling |
| **Display** | Inline logic | GiftcardDisplay | Isolated concerns |
| **Functions** | Unclear names | Descriptive names | Clear intent |

---

## Implementation Order

1. **Start with AuthForm** - easiest, validates pattern
2. **Then AlertNotification** - used widely
3. **Then TransactionModals** - complex but high impact
4. **Then Buttons** - reusable immediately
5. **Then GiftcardDisplay** - smaller component
6. **Finally** - rename variables as you work

Each step validates the refactoring approach before moving to the next!
