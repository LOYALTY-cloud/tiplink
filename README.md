This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Supabase Migrations

To apply the latest Supabase migrations, run the SQL in your Supabase SQL Editor:

```sql
-- supabase/migrations/20250210_add_profile_handle_limits.sql
alter table if exists profiles
	add column if not exists handle_change_count integer default 0,
	add column if not exists handle_change_window_start timestamptz;

-- supabase/migrations/20260215_drop_subscription_columns.sql
-- Remove subscription tier columns (no longer used - all users have 5% platform fee)
alter table public.profiles
  drop column if exists subscription_tier;

alter table public.profiles
  drop column if exists is_paid;
```

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.


Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## ⚡ Running a Migration Safely

**Prerequisites:**
- `pg_dump` and `psql` are on your system `PATH`.
- Run as a privileged DB user (owner or service-role).

**One-liner to backup + apply migration + verify:**

```bash
# Replace DATABASE_URL and migration file as needed
pg_dump "$DATABASE_URL" | gzip > backup_$(date +%Y%m%d_%H%M%S).sql.gz && \
psql "$DATABASE_URL" -f path/to/your/migration.sql && \
psql "$DATABASE_URL" -c "SELECT 1;"
```

**Steps explained:**
- Creates a timestamped backup of your current database.
- Applies your migration SQL file.
- Runs a simple query to verify connectivity.

✅ **Recommended:** Always backup before applying any schema changes.

## Wallet Reconciliation

TipLinkMe uses a `transactions_ledger` table as the source of truth for all financial activity.

A scheduled GitHub Action automatically reconciles wallet balances with ledger entries to ensure financial integrity.

**Schedule**

Runs daily at 03:00 UTC via:

```
.github/workflows/reconcile.yml
```

**Required Secrets**

The workflow requires these repository secrets:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Add them in:

GitHub → Repository → Settings → Secrets and Variables → Actions

**Manual Run**

You can run reconciliation manually from:

GitHub → Actions → Reconcile wallets → Run workflow

**What the Script Does**

The script:

- Fetches all wallets
- Calculates balance from `transactions_ledger`
- Updates `wallets.balance` if mismatched
- Logs corrections

Script location:

```
scripts/reconcileWallets.ts
```

This ensures wallet balances remain consistent with the financial ledger.

## Next steps and important rules

2️⃣ What we should implement next (VERY important)

Now that reconciliation exists, the most important rule is:

Every money movement must write to `transactions_ledger`.

Right now you already patched:

- ✅ Tips
- ✅ Withdrawals
- ✅ Stripe webhook tip processing

Next we should patch remaining flows:

1️⃣ Virtual Card Charges

When user spends from card, write a ledger entry, for example:

```
ledger_type: card_charge
amount: -$X
```

2️⃣ Card Refunds

```
ledger_type: card_refund
amount: +$X
```

3️⃣ Promo / Bonus credits

```
ledger_type: promo_credit
amount: +$X
```

4️⃣ Stripe payout fees

```
ledger_type: payout_fee
amount: -$X
```

## System architecture

Your fintech backend now looks like this:

```
Users
	│
	▼
Wallets (cached balance)
	│
	▼
Transactions Ledger (source of truth)
	│
	├─ Tips
	├─ Withdrawals
	├─ Card charges
	├─ Refunds
	└─ Promos
	│
	▼
Daily Reconciliation Script
```

This is how real fintech systems avoid money bugs. CashApp / Venmo / Stripe all use a ledger-first architecture like this.

## Virtual Card system status

You’re about 80–85% done. Remaining work:

| Feature | Status |
|---|---|
| Stripe connected accounts | ✅ |
| Onboard queue system | ✅ |
| Retry worker | ✅ |
| Admin logging | ✅ |
| Cards table | ✅ |
| Card creation API | ✅ |
| Ledger system | ✅ |
| Reconciliation script | ✅ |
| Automated reconciliation | ✅ |
| Stripe card issuing integration | ⚠️ next |
| Card spend ledger hooks | ⚠️ next |
| Card dashboard UI | ⚠️ next |

## Recommended next feature

The next thing to build is: Stripe Issuing Card Creation

When a user signs up:

```
User verified
	  ↓
Create Stripe Issuing Cardholder
	  ↓
Create Virtual Card
	  ↓
Save card_id in cards table
```

Then users can spend their TipLinkMe wallet balance.

## Additional table recommendation

There is ONE more table recommended soon: `ledger_audit_logs`

This logs:

```
who modified ledger
why
admin actions
manual corrections
```

It protects you from fraud, accounting disputes, and regulatory audits.


