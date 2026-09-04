# SkullPOS - Point of Sale System

A modern, full-featured Point of Sale (POS) system designed for Skull Space with support for multiple payment methods, inventory management, and detailed sales analytics.

## Project Overview

SkullPOS is built with React and provides:
- **User Authentication** - Login/Register with email domain validation
- **Product Management** - Categories, items, and inventory tracking
- **Shopping Cart** - Add/remove items, apply discounts
- **Payment Processing** - Stripe Terminal, Cash, and Giftcard payments
- **Barcode Scanning** - Integrated barcode scanner support
- **Sales Analytics** - Detailed sales reports with COGS tracking
- **Member Discounts** - Apply percentage-based member discounts

## Project Structure

```
src/
├── components/
│   ├── auth/                      # Authentication components
│   ├── common/                    # Shared reusable components
│   ├── pos/                       # Point of sale specific components
│   ├── App.js                     # Root component
│   ├── login.js                   # Login page
│   └── register.js                # Registration page
├── utils/
│   ├── api.js                     # Appwrite backend integration
│   ├── barcode.js                 # Barcode processing
│   ├── cartUtils.js               # Cart state management
│   ├── checkout.js                # Checkout flow
│   ├── format.js                  # Formatting utilities
│   ├── handleCardPayment.js       # Card payment handler
│   └── stripe.js                  # Stripe Terminal integration
└── index.js                       # Entry point
```

## Recent Refactoring

This project has been refactored to improve code organization and maintainability:

### New Reusable Components
- **AuthForm** - Shared authentication form for login/register
- **AlertNotification** - Unified notification component
- **TransactionModals** - Transaction-related modal dialogs
- **PaymentMethodButtons** - Payment method selector
- **CheckoutButton** - Checkout with clear cart action
- **GiftcardDisplay** - Giftcard information display

### Variable Naming Improvements
- Consistent camelCase conventions
- Descriptive boolean prefixes (`is`, `has`)
- Clear callback naming (`on` prefix)
- Full words instead of abbreviations

See [REFACTORING_SUMMARY.md](./REFACTORING_SUMMARY.md) for details.

## Technology Stack

- **Frontend Framework:** React 19.2.0
- **UI Library:** Material-UI (MUI) 7.3.4
- **Backend:** Appwrite (BaaS)
- **Payment Processing:** Stripe Terminal
- **Routing:** React Router DOM 7.9.3
- **Icons:** Material-UI Icons

## Getting Started with Create React App

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Installation & Setup

```bash
# Install dependencies
npm install

# Start development server
npm start

# Build for production
npm build

# Run tests
npm test
```

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will reload when you make changes.\
You may also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time.

## Documentation

- **[REFACTORING_SUMMARY.md](./REFACTORING_SUMMARY.md)** - Overview of recent refactoring
- **[REFACTORING_GUIDE.md](./REFACTORING_GUIDE.md)** - Detailed refactoring documentation
- **[COMPONENT_LIBRARY.md](./COMPONENT_LIBRARY.md)** - Reusable components reference

## Feature Documentation

### Authentication
- Email/password login and registration
- Email domain validation (requires @skullspace.ca)
- Secure session management

### POS System
- Category-based product browsing
- Shopping cart with add/remove functionality
- Real-time cart updates and total calculation

### Payment Methods
1. **Stripe Terminal** - Card payments with tip support
2. **Cash** - Manual cash entry with change calculation
3. **Giftcards** - Full or partial payment with giftcard code
4. **Hybrid** - Combine giftcard + card payment

### Discounts
- Member discount percentage (configurable)
- Applied to entire order
- Visible in cart total

### Barcode Scanning
- UPC barcode scanning
- Giftcard code detection (prefix: 75855)
- Visual feedback on scan results

### Sales Analytics
- Date range filtering (12h, 24h, 1w, all-time)
- Sales breakdown by category
- Payment method analysis
- Cost of goods sold (COGS) calculation
- Profit margin reporting

## Backend Configuration

Uses Appwrite Backend-as-a-Service:
- Database: `67c9ffd9003d68236514`
- Collections:
  - Categories: `67c9ffdd0039c4e09c9a`
  - Items: `67c9ffe6001c17071bb7`
  - Transactions: `68e4cd3500179ce661c6`
  - Giftcards: `giftcards`

## Environment

- **Development:** Localhost mode enabled (test transactions)
- **Production:** Full Stripe Terminal integration
- **Endpoint:** `https://api.cloud.shotty.tech/v1`

## Key Technologies

### Frontend
- **React 19** - Component-based UI
- **Material-UI** - Professional UI components
- **React Router** - Client-side routing

### Payment Processing
- **Stripe Terminal** - Card payment hardware
- **@stripe/terminal-js** - Terminal SDK

### Backend
- **Appwrite** - Open-source Backend-as-a-Service
- **Appwrite Functions** - Serverless payment processing

## Code Quality

- ESLint configured for React
- Comprehensive component documentation
- Reusable utility functions
- Clear separation of concerns

## Performance Optimizations

- Memoized callbacks with useCallback
- Optimized re-renders with useMemo
- Lazy loading of modals and reports
- Efficient state management with refs

## Accessibility

All components follow ARIA standards:
- Semantic HTML
- Keyboard navigation
- ARIA labels on interactive elements
- Tooltips for clarity

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

### Code Splitting

See [Create React App Code Splitting](https://facebook.github.io/create-react-app/docs/code-splitting)

### Analyzing the Bundle Size

See [Create React App Bundle Analysis](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

### Making a Progressive Web App

See [Create React App PWA](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

### Advanced Configuration

See [Create React App Configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration)

## Troubleshooting

### Build Issues

If `npm run build` fails to minify, see [Create React App Troubleshooting](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)

### Terminal Connection Issues

1. Ensure Stripe Terminal reader is online
2. Check network connectivity
3. Verify location configuration matches reader
4. Restart terminal connection via UI

### Payment Processing Issues

- **Card declined:** Check card details and ensure sufficient funds
- **Terminal timeout:** Verify stable internet connection
- **Payment intent error:** Check Stripe account configuration

## Contributing

When adding new features:
1. Check [COMPONENT_LIBRARY.md](./COMPONENT_LIBRARY.md) for reusable components
2. Use existing utility functions where possible
3. Follow variable naming conventions from refactoring
4. Add JSDoc comments to new functions
5. Test payment flows thoroughly

## License

This project is part of the Skull Space infrastructure.

