This PR introduces the 1neLink virtual card infrastructure.

Major additions:

• Stripe Issuing webhook support
• Unified Stripe webhook (tips, payouts, refunds, card transactions)
• Ledger integration for all financial flows
• Card spending limits (daily/monthly)
• Card decline tracking
• Wallet reconciliation logic
• Card control API

Endpoints added:

GET /api/cards
POST /api/cards/freeze
POST /api/cards/unfreeze
POST /api/cards/update-limits
GET /api/cards/transactions

Lint fixes:
• ESLint auto-fixes applied
• 0 lint errors
• Remaining warnings mostly no-explicit-any

Build:
• Next.js build passes successfully

Next milestone after merge:
Card Dashboard UI (view/freeze/set limits/view transactions/remaining spend)
