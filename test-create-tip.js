/**
 * Test script to create a tip with receipt_id
 * Run with: node test-create-tip.js
 * 
 * Make sure to set environment variables:
 * - NEXT_PUBLIC_SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 * - TEST_RECEIVER_USER_ID (a valid user_id from your auth.users table)
 */

async function createTestTip() {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:3000';
  const apiUrl = baseUrl.includes('localhost') 
    ? 'http://localhost:3000/api/tips/create'
    : `${baseUrl.replace('supabase.co', '')}/api/tips/create`;

  // Test data
  const tipData = {
    receiver_user_id: process.env.TEST_RECEIVER_USER_ID || 'REPLACE_WITH_VALID_USER_ID',
    amount: 10.00,
    tipper_name: 'Test Supporter',
    receipt_email: 'test@example.com',
    note: 'Test tip from automated script'
  };

  console.log('Creating test tip...');
  console.log('Data:', JSON.stringify(tipData, null, 2));

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(tipData)
    });

    const result = await response.json();
    
    if (!response.ok) {
      console.error('❌ Error creating tip:', result);
      return;
    }

    console.log('✅ Tip created successfully!');
    console.log('Response:', JSON.stringify(result, null, 2));
    console.log('\n📧 Receipt ID:', result.receipt_id);
    console.log('🔗 Receipt URL:', `${baseUrl.replace(/\/+$/, '')}/r/${result.receipt_id}`);
    
  } catch (error) {
    console.error('❌ Network error:', error.message);
  }
}

createTestTip();
