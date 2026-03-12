#!/bin/bash
# Simple test for get_weekly_card_spend and get_monthly_card_spend RPCs
# Usage: export SUPABASE_URL and SERVICE_ROLE_KEY and USER_ID, then run.

set -euo pipefail

if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SERVICE_ROLE_KEY:-}" ] || [ -z "${USER_ID:-}" ]; then
  echo "Please set SUPABASE_URL, SERVICE_ROLE_KEY, and USER_ID environment variables"
  echo "Example: SUPABASE_URL=https://xyz.supabase.co SERVICE_ROLE_KEY=sb_secret_... USER_ID=000-... ./test-card-limits.sh"
  exit 1
fi

BASE="$SUPABASE_URL/rest/v1"
AUTH_HEADER="Authorization: Bearer $SERVICE_ROLE_KEY"
APIKEY_HEADER="apikey: $SERVICE_ROLE_KEY"

echo "Calling get_weekly_card_spend for user $USER_ID"
curl -s -X POST "$BASE/rpc/get_weekly_card_spend" \
  -H "Content-Type: application/json" \
  -H "$APIKEY_HEADER" \
  -H "$AUTH_HEADER" \
  -d "{ \"p_user_id\": \"$USER_ID\" }" | jq '.'

echo "\nCalling get_monthly_card_spend for user $USER_ID"
curl -s -X POST "$BASE/rpc/get_monthly_card_spend" \
  -H "Content-Type: application/json" \
  -H "$APIKEY_HEADER" \
  -H "$AUTH_HEADER" \
  -d "{ \"p_user_id\": \"$USER_ID\" }" | jq '.'

echo "\n(Optional) Insert a sample card_charge into transactions_ledger and re-run RPCs"
echo "To insert a sample transaction run the following curl (uncomment if desired):"
cat <<'EOF'
curl -s -X POST "$BASE/transactions_ledger" \
  -H "Content-Type: application/json" \
  -H "$APIKEY_HEADER" \
  -H "$AUTH_HEADER" \
  -d '{ "user_id": "'$USER_ID'", "type": "card_charge", "amount": 10.00, "metadata": {} }' | jq '.'
EOF

echo "Done"
