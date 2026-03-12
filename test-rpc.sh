#!/bin/bash
# Test the RPC function with different methods

echo "1. Testing RPC with POST method..."
curl -s -X POST "${SUPABASE_URL:-https://your-project.supabase.co}/rest/v1/rpc/get_tip_receipt" \
  -H "apikey: ${SUPABASE_PUBLIC_KEY:-sb_public_...}" \
  -H "Content-Type: application/json" \
  -d '{"rid":"TLM-1771084313297-A40A23"}' | jq '.'

echo ""
echo "2. Direct query to tips table with join..."
curl -s "${SUPABASE_URL:-https://your-project.supabase.co}/rest/v1/tips?select=receipt_id,amount,net,created_at,receiver_user_id,profiles(handle,display_name)&receipt_id=eq.TLM-1771084313297-A40A23" \
  -H "apikey: ${SUPABASE_PUBLIC_KEY:-sb_public_...}" \
  -H "Authorization: Bearer ${SUPABASE_PUBLIC_KEY:-sb_public_...}" | jq '.'

echo ""
echo "3. Testing with service role key..."
curl -s -X POST "${SUPABASE_URL:-https://your-project.supabase.co}/rest/v1/rpc/get_tip_receipt" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY:-sb_secret_...}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY:-sb_secret_...}" \
  -H "Content-Type: application/json" \
  -d '{"rid": "TLM-1771084313297-A40A23"}' | jq '.'
