# Stripe Connect Setup Guide

## 🏭 Setup Instructions

To enable creators to receive tips and withdraw to their bank accounts, you need to enable Stripe Connect.

### Step 1: Apply Database Migration

**Copy and paste this SQL into your Supabase SQL Editor:**
(Go to: https://supabase.com/dashboard → Your Project → SQL Editor → New Query)

```sql
-- Add Stripe Connect columns to profiles table
alter table public.profiles
add column if not exists stripe_account_id text;

alter table public.profiles
add column if not exists payouts_enabled boolean not null default false;

alter table public.profiles
add column if not exists payouts_enabled_at timestamptz;

-- Index for fast lookups
create index if not exists profiles_stripe_account_id_idx 
  on public.profiles(stripe_account_id);
```

### Step 2: Enable Stripe Connect

1. **Go to Stripe Dashboard**: https://dashboard.stripe.com/
2. **Click "Connect"** in the left sidebar
3. **Click "Get started"** 
4. **Fill out the form**:
   - Select "Platform or marketplace"
   - Provide your business information
   - Complete verification
5. **Save and activate**

### Step 3: Test the Flow

1. Go to `/dashboard`
2. You should see a green "Activate payouts" card
3. Click **"Connect now"**
4. Complete Stripe's Express onboarding
5. After returning, you'll see "✅ Payouts active"

---

## 🔧 Environment Variables

Make sure these are set in `.env.local`:

```env
# Stripe (get from https://dashboard.stripe.com/apikeys)
STRIPE_SECRET_KEY=sk_test_xxx  # Use sk_live_xxx in production
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxx

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx  # From Supabase dashboard → Settings → API

# Site URL (important for Stripe redirects)
NEXT_PUBLIC_SITE_URL=https://your-domain.com  # Or Codespaces URL
```

---

## 📝 How It Works

### Stripe Express Connect Flow

1. **User clicks "Connect now"** on the dashboard
2. **Stripe account created** - A Stripe Express account is created for the creator
3. **Onboarding redirect** - User is redirected to Stripe's hosted onboarding
4. **Identity verification** - Stripe collects required information (SSN, address, etc.)
5. **Bank account setup** - User connects their bank account
6. **Return to app** - After completion, user returns to dashboard
7. **Status sync** - App verifies account status and enables payouts
8. **Ready to receive** - Creator can now receive tips and withdraw funds

---

## 🐛 Troubleshooting

### "Connect now" button doesn't appear
- ✅ Check: Did you apply the database migration?
- ✅ Check: Are you logged in?
- ✅ Check: Do you have a profile created?

### Error: "Stripe Connect not enabled"
- ✅ Go to Stripe Dashboard → Connect
- ✅ Click "Get started" and complete the form
- ✅ Wait for approval (usually instant for test mode)

### Button redirects but onboarding doesn't complete
- ✅ Check browser console for errors
- ✅ Verify your Stripe account is in the correct mode (test/live)
- ✅ Ensure all required fields in Stripe onboarding are completed

### "Payouts active" shows but withdrawals don't work
- ✅ Check that `payouts_enabled` is true in database
- ✅ Verify Stripe account has both `charges_enabled` and `payouts_enabled`
- ✅ Use the "Re-check" button to sync status

---

## 📱 Testing the Full Flow

1. ✅ Apply migration in Supabase SQL Editor
2. ✅ Enable Stripe Connect in your dashboard
3. ✅ Login to your app dashboard
4. ✅ Click "Connect now"
5. ✅ Complete Stripe onboarding
6. ✅ Return to dashboard and see "Payouts active"
7. ✅ Test creating a tip payment
8. ✅ Test withdrawing to bank account

---

## 🔐 Security Notes

- `SUPABASE_SERVICE_ROLE_KEY` gives admin access - keep it secret!
- Never commit `.env.local` to git
- Use test keys (`sk_test_*`) during development
- Switch to live keys (`sk_live_*`) only in production

