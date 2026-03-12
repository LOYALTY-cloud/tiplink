# Stripe & Database Setup Instructions

## ✅ Environment Variables (COMPLETED)

Added to `.env.local`:
- ✅ `NEXT_PUBLIC_SUPABASE_ANON_KEY` (already existed)
- ✅ `STRIPE_SECRET_KEY` (already existed)  
- ✅ `STRIPE_WEBHOOK_SECRET` (added - **REPLACE WITH YOUR ACTUAL SECRET**)

## 📋 Step 1: Run Database Migrations

Go to your Supabase Dashboard → SQL Editor and run these migrations in order:

### Migration 1: Add Stripe columns to tips table
```sql
-- Add Stripe payment intent tracking and receipt ID to tips table

alter table public.tips
  add column if not exists stripe_payment_intent_id text,
  add column if not exists receipt_id text;

-- Create unique indexes to prevent duplicate payments
create unique index if not exists uniq_tips_pi on public.tips(stripe_payment_intent_id);
create unique index if not exists uniq_tips_receipt on public.tips(receipt_id);
```

### Migration 2: Add Stripe payout columns to withdrawals table
```sql
-- Add Stripe payout tracking columns to withdrawals table

alter table public.withdrawals
  add column if not exists stripe_payout_id text,
  add column if not exists payout_method text;
```

**Link to Supabase SQL Editor:**
https://supabase.com/dashboard/project/cjakxygbgijsknoadrrs/sql/new

---

## 🔗 Step 2: Configure Stripe Webhook

### A. Get your webhook endpoint URL
Your webhook endpoint is:
```
https://tiplinkme.com/api/stripe/webhook
```

### B. Create webhook in Stripe Dashboard

1. Go to: https://dashboard.stripe.com/test/webhooks
2. Click **"Add endpoint"**
3. Enter endpoint URL: `https://tiplinkme.com/api/stripe/webhook`
4. Click **"Select events"** and add these events:
   - `payment_intent.succeeded` ✅
   - `payment_intent.payment_failed` ✅
   - `payout.paid` ✅
   - `payout.failed` ✅
   - `payout.canceled` ✅
   - `account.updated` ✅ (already handled)
5. Click **"Add endpoint"**

### C. Get your webhook signing secret

1. After creating the endpoint, click on it
2. Click **"Reveal"** under "Signing secret"
3. Copy the secret (starts with `whsec_`)
4. Update `.env.local`:
   ```
   STRIPE_WEBHOOK_SECRET="whsec_YOUR_ACTUAL_SECRET_HERE"
   ```

### D. Test the webhook (optional)

In the Stripe Dashboard webhook page, click **"Send test webhook"** and select `payment_intent.succeeded` to verify it works.

---

## 🔄 Step 3: Restart Your Dev Server

After adding the webhook secret:
```bash
# Stop the current dev server (Ctrl+C)
npm run dev
```

---

## 📝 What Got Updated

### New Files Created:
- `src/app/api/withdrawals/create/route.ts` - Instant/standard payout handling
- `supabase/migrations/20260214_add_tips_stripe_columns.sql`
- `supabase/migrations/20260214_add_withdrawals_stripe_columns.sql`

### Files Updated:
- `src/lib/stripe/server.ts` - Unified Stripe instance with stable API version
- `src/app/api/payments/create/route.ts` - Added receipt_id + idempotency
- `src/app/api/stripe/webhook/route.ts` - Added payment & payout handlers

### Payment Flow Now:
1. User tips → PaymentIntent created with unique `receipt_id`
2. Stripe webhook `payment_intent.succeeded` → Creates tip record in DB
3. Receipt page `/r/[receiptId]` works immediately
4. Creator withdraws → Instant or standard payout
5. Webhook updates withdrawal status when payout completes

---

## 🧪 Testing Checklist

- [ ] Run both SQL migrations in Supabase
- [ ] Create Stripe webhook endpoint  
- [ ] Add webhook secret to `.env.local`
- [ ] Restart dev server
- [ ] Test a tip payment
- [ ] Check tip appears in database with receipt_id
- [ ] Test withdrawal (ensure Stripe Connect account has balance)
- [ ] Verify webhook events in Stripe Dashboard

---

## 🚨 Troubleshooting

**Webhook not receiving events?**
- Check webhook URL is correct (no trailing slash)
- Verify STRIPE_WEBHOOK_SECRET matches Stripe Dashboard
- Check webhook logs in Stripe Dashboard for errors

**Migrations fail?**
- Check if `tips` and `withdrawals` tables exist
- Run migrations one at a time
- Check Supabase logs for specific errors

**Payout fails?**
- Verify connected account has available balance
- Check if payouts are enabled for the account
- Instant payouts require eligible debit card
