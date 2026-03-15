# TipLinkMe PR Checklist

## Database Migration Safety

- [ ] Migration reviewed for data loss risks
- [ ] Foreign keys verified
- [ ] Backfill queries tested
- [ ] Migration applied to staging/dev first
- [ ] No production tables dropped

## Financial System Checks

- [ ] transactions_ledger rows still accessible
- [ ] wallets balance matches ledger sum
- [ ] wallet_locks table still working
- [ ] withdrawals still enforce locks

## Stripe Integration

- [ ] payment_intent.succeeded webhook still creates ledger entry
- [ ] charge.refunded webhook still inserts refund ledger row
- [ ] stripe_account_id still linked to profiles.id

## Tests

Run locally:
npm run test-webhook-all npx tsx scripts/test-tip-flow.ts

Expected result:
Webhook tests: PASS Tip flow test: PASS

## Post-Merge Verification

Run SQL checks:

```sql
select user_id, sum(amount)
from transactions_ledger
group by user_id;
```
Compare with:
```sql
select user_id, balance
from wallets;
```
Balances must match.
Final Step
Apply migration:

```bash
supabase db push
```
or run:

```sql
-- contents of 20260316_normalize_user_fks.sql
```

---

# Commit It

Run:

```bash
git add .github/PR_CHECKLIST.md
git commit -m "docs: add PR migration safety checklist"
git push origin fix/schema-normalization
```

Why This Helps
Your project now contains real money logic, so this checklist protects against:

- duplicate payouts
- wallet corruption
- ledger mismatches
- FK breakage
- migration data loss

Even large fintech teams use checklists like this.
