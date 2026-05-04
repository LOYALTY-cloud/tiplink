#!/bin/bash
# Test script to create a tip with receipt
# Usage: ./test-tip.sh <receiver_user_id>

if [ -z "$1" ]; then
  echo "❌ Please provide a receiver_user_id"
  echo "Usage: ./test-tip.sh <receiver_user_id>"
  echo ""
  echo "To find a user ID, check your Supabase auth.users table"
  exit 1
fi

RECEIVER_USER_ID="$1"

echo "🚀 Creating test tip for user: $RECEIVER_USER_ID"
echo ""

RESPONSE=$(curl -s -X POST http://localhost:3000/api/tips/create \
  -H "Content-Type: application/json" \
  -d "{
    \"receiver_user_id\": \"$RECEIVER_USER_ID\",
    \"amount\": 25.00,
    \"tipper_name\": \"Alice Supporter\",
    \"receipt_email\": \"alice@example.com\",
    \"note\": \"Thanks for the amazing content! 💖\"
  }")

echo "Response:"
echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
echo ""

# Extract receipt_id if successful
RECEIPT_ID=$(echo "$RESPONSE" | jq -r '.receipt_id' 2>/dev/null)

if [ "$RECEIPT_ID" != "null" ] && [ -n "$RECEIPT_ID" ]; then
  echo "✅ Tip created successfully!"
  echo ""
  echo "📧 Receipt ID: $RECEIPT_ID"
  echo "🔗 Receipt URL: http://localhost:3000/r/$RECEIPT_ID"
  echo ""
  echo "Open the receipt page to view it!"
else
  echo "❌ Failed to create tip. Check the response above."
fi
