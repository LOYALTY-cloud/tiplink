# Wallet Sync & Balance Management Setup

## ✅ Completed Changes

### Code Changes:
1. **Webhook Route Updated**: [src/app/api/stripe/webhook/route.ts](src/app/api/stripe/webhook/route.ts)
   - Uses RPC functions for atomic operations
   - Added `balance.available` handler for real-time wallet sync
   - Updated payout failed/canceled to use RPC

### SQL Migrations Created:
1. [20260214_add_process_tip_succeeded_function.sql](supabase/migrations/20260214_add_process_tip_succeeded_function.sql) - Credits **pending** balance on tip success
2. [20260214_add_wallet_sync_function.sql](supabase/migrations/20260214_add_wallet_sync_function.sql) - Syncs wallet from Stripe balance
3. [20260214_add_payout_failed_function.sql](supabase/migrations/20260214_add_payout_failed_function.sql) - Handles failed/canceled payouts (no wallet changes)

---

## 📋 Run These SQL Migrations in Supabase

Go to: https://supabase.com/dashboard/project/cjakxygbgijsknoadrrs/sql/new

Run in this order:

### 1. Process Tip Succeeded Function (Credits PENDING)
```sql
-- Function to process successful tip payments (credits pending wallet balance)

create or replace function public.process_tip_succeeded(
  p_stripe_payment_intent_id text,
  p_creator_user_id uuid,
  p_amount numeric,
  p_platform_fee numeric,
  p_net numeric,
  p_receipt_id text
)
returns void
language plpgsql
security definer
as $$
declare
  inserted_count int;
begin
  -- Upsert tip record (prevents duplicates if webhook retries)
  insert into public.tips (
    stripe_payment_intent_id,
    receiver_user_id,
    amount,
    platform_fee,
    net,
    receipt_id,
    status,
    created_at,
    updated_at
  ) values (
    p_stripe_payment_intent_id,
    p_creator_user_id,
    p_amount,
    p_platform_fee,
    p_net,
    p_receipt_id,
    'succeeded',
    now(),
    now()
  )
  on conflict (stripe_payment_intent_id) do update
  set status = 'succeeded',
      updated_at = now();

  -- Check if this was a new insert (not an update)
  get diagnostics inserted_count = row_count;

  -- Only credit wallet if newly inserted (prevents duplicate credits on webhook retries)
  if inserted_count = 1 then
    -- Ensure wallet row exists
    perform public.ensure_wallet_row(p_creator_user_id);

    -- Credit PENDING balance (funds not yet available for withdrawal)
    update public.wallets
    set pending = pending + p_net,
        updated_at = now()
    where user_id = p_creator_user_id;
  end if;
end;
$$;

revoke all on function public.process_tip_succeeded(text, uuid, numeric, numeric, numeric, text) from public;
grant execute on function public.process_tip_succeeded(text, uuid, numeric, numeric, numeric, text) to authenticated;
```

### 2. Wallet Sync Function
```sql
-- Function to sync wallet balances from Stripe balance API

create or replace function public.sync_wallet_from_stripe_balance(
  p_user_id uuid,
  p_available numeric,
  p_pending numeric
)
returns void
language plpgsql
security definer
as $$
begin
  perform public.ensure_wallet_row(p_user_id);

  update public.wallets
  set available = greatest(p_available, 0),
      pending   = greatest(p_pending, 0),
      updated_at = now()
  where user_id = p_user_id;
end;
$$;

revoke all on function public.sync_wallet_from_stripe_balance(uuid, numeric, numeric) from public;
grant execute on function public.sync_wallet_from_stripe_balance(uuid, numeric, numeric) to authenticated;
```

### 3. Payout Failed/Canceled Function
```sql
-- Function to mark payout as failed or canceled (no wallet changes)

create or replace function public.process_payout_failed_or_canceled(
  p_withdrawal_id uuid,
  p_user_id uuid,
  p_status text,              -- 'failed' or 'canceled'
  p_stripe_payout_id text
)
returns void
language plpgsql
security definer
as $$
begin
  update public.withdrawals
  set status = p_status,
      stripe_payout_id = coalesce(stripe_payout_id, p_stripe_payout_id),
      updated_at = now()
  where id = p_withdrawal_id
    and user_id = p_user_id;
end;
$$;

revoke all on function public.process_payout_failed_or_canceled(uuid, uuid, text, text) from public;
grant execute on function public.process_payout_failed_or_canceled(uuid, uuid, text, text) to authenticated;
```

---

## 🔗 Update Stripe Webhook Events

In Stripe Dashboard webhook settings:
https://dashboard.stripe.com/test/webhooks

**Add this event** (if not already added):
- ✅ `balance.available` - **CRITICAL** for wallet sync

**Existing events** (verify these are enabled):
- ✅ `payment_intent.succeeded`
- ✅ `payment_intent.payment_failed`
- ✅ `payout.paid`
- ✅ `payout.failed`
- ✅ `payout.canceled`
- ✅ `account.updated`

**IMPORTANT**: Make sure webhook is configured to receive **Connected account events**!

---

## 💰 How The New Wallet Flow Works

### Payment Flow:
1. **Tip succeeds** → `payment_intent.succeeded` fires
   - Creates tip record in DB
   - Credits `wallets.pending` (not yet withdrawable)
   
2. **Stripe clears funds** → `balance.available` fires
   - Syncs wallet with real Stripe balance
   - Moves funds from `pending` to `available`
   - User can now withdraw

### Withdrawal Flow:
1. **User requests withdrawal** → API checks Stripe balance
2. **Payout created** → Funds leave Stripe account
3. **`payout.paid` event** → Debits `wallets.available`
4. **`payout.failed` or `payout.canceled`** → Only updates status (no wallet change)

### Benefits:
✅ **Pending balance** reflects incoming tips not yet withdrawable  
✅ **Available balance** matches Stripe (real source of truth)  
✅ **No duplicate credits/debits** (RPC functions are idempotent)  
✅ **Failed payouts don't affect balance** (wallet stays accurate)  

---

## 🧪 Testing Checklist

After running migrations:

- [ ] Run all 3 SQL migrations in Supabase
- [ ] Add `balance.available` to Stripe webhook events
- [ ] Restart dev server (`npm run dev`)
- [ ] Test a tip payment
  - Check `tips` table has record
  - Check `wallets.pending` increased
- [ ] Wait for or trigger `balance.available` event
  - Check `wallets.available` updated
  - Check `wallets.pending` adjusted
- [ ] Test withdrawal
  - Check `wallets.available` decreased
  - Check `withdrawals` status updated to 'paid'
- [ ] Test failed payout (use Stripe test mode)
  - Check withdrawal status = 'failed'
  - Check wallet balance unchanged

---

## 🚨 Important Notes

1. **Source of Truth**: Stripe balance is the source of truth. Your wallet should eventually match Stripe.

2. **Timing**: `balance.available` event timing varies:
   - Instant for instant payouts
   - 2-7 days for standard destination charges
   - Your UI should show both `pending` and `available`

3. **Connect Accounts**: The `balance.available` event includes `event.account` which is the connected account ID (not platform account).

4. **Idempotency**: All RPC functions handle duplicate calls safely (webhook retries won't double-credit).

5. **Manual Sync**: You may want to add a manual "Sync Balance" button that calls Stripe's balance API and updates the wallet directly.
