#!/bin/bash
# Direct database query test
# This will use the Supabase client to check if the receipt exists

echo "Testing receipt lookup..."
echo ""

curl -s "${SUPABASE_URL:-https://your-project.supabase.co}/rest/v1/rpc/get_tip_receipt" \
  -H "apikey: ${SUPABASE_PUBLIC_KEY:-sb_public_...}" \
  -H "Authorization: Bearer ${SUPABASE_PUBLIC_KEY:-sb_public_...}" \
  -H "Content-Type: application/json" \
  -d '{"rid": "TLM-1771084313297-A40A23"}' | jq '.'

echo ""
echo "---"
echo ""
echo "Checking if tips table exists and has data..."
curl -s "${SUPABASE_URL:-https://your-project.supabase.co}/rest/v1/tips?select=receipt_id,amount,created_at&receipt_id=eq.TLM-1771084313297-A40A23" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY:-sb_secret_...}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY:-sb_secret_...}" | jq '.'
