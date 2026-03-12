#!/bin/bash
# Apply Stripe Connect migration to Supabase

echo "📦 Applying Stripe Connect migration..."

# Read database URL from env
if [ -f .env.local ]; then
  export $(cat .env.local | grep -v '^#' | xargs)
fi

# Extract connection details
SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL}"
SERVICE_KEY="${SUPABASE_SERVICE_ROLE_KEY}"

if [ -z "$SUPABASE_URL" ] || [ -z "$SERVICE_KEY" ]; then
  echo "❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local"
  exit 1
fi

# Extract project ref from URL (e.g., https://abc123.supabase.co -> abc123)
PROJECT_REF=$(echo $SUPABASE_URL | sed -E 's|https://([^.]+)\.supabase\.co|\1|')

echo "🔗 Project: $PROJECT_REF"
echo "📝 Running migration..."

# Use the REST API to execute SQL
curl -X POST \
  "${SUPABASE_URL}/rest/v1/rpc/exec_sql" \
  -H "apikey: ${SERVICE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_KEY}" \
  -H "Content-Type: application/json" \
  -d @- << 'EOF'
{
  "query": "-- Add Stripe Connect columns to profiles table\nalter table public.profiles\nadd column if not exists stripe_account_id text;\n\nalter table public.profiles\nadd column if not exists payouts_enabled boolean not null default false;\n\nalter table public.profiles\nadd column if not exists payouts_enabled_at timestamptz;\n\ncreate index if not exists profiles_stripe_account_id_idx on public.profiles(stripe_account_id);"
}
EOF

echo ""
echo "✅ Migration applied! You can also run this manually in Supabase SQL Editor:"
echo ""
cat supabase/migrations/20260216_add_stripe_connect_columns.sql

