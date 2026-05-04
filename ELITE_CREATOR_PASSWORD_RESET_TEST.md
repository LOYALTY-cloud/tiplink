# Elite Creator Password Reset - Manual Test Guide

## ✅ Fixes Applied (May 2, 2025)

### Problem
Clicking "Set Your Password →" in elite creator approval email redirected to login instead of password form.

### Solution
1. **Added debug logging** to `/auth/callback/route.ts` to see what parameters Supabase sends
2. **Fixed `generateLink()` call** in `/admin/creators/review/route.ts` to explicitly specify `redirectTo`

---

## 🧪 How to Test

### Prerequisites
- Dev server running: `npm run dev` on localhost:3000
- Admin access or database connection to approve applications

### Quick Test (Manual Browser)

#### Step 1: Submit Application
```
1. Open: http://localhost:3000/elitecreator
2. Fill in form:
   - Name: "Test Elite Creator"
   - Email: "youremail+elite@test.com" (use gmail alias)
   - Linkage/URL: anything
   - Intent: "monetize_content"
   - Display Name: "TestCreator"
   - Handle: "tc_testcreator"
3. Submit
```

#### Step 2: Approve Application
Using admin API (requires valid admin token):
```bash
curl -X POST "http://localhost:3000/api/admin/creators/review" \
  -H "Content-Type: application/json" \
  -H "X-Admin-Id: your_admin_id" \
  -d '{
    "id": "APP_ID_FROM_DB",
    "status": "approved"
  }'
```

Or through admin panel if available.

#### Step 3: Check Email
- Go to Gmail/Resend inbox for `youremail+elite@test.com`
- Find approval email with "You're In 🎉" subject
- Look for "Set Your Password →" button

#### Step 4: Verify Redirect Chain
1. **Open DevTools** (F12) → Network tab
2. **Click "Set Your Password →"** button
3. **Watch redirect chain:**
   - Request 1: Recovery link from email → /auth/callback?token_hash=X&type=recovery
   - Request 2: /auth/callback redirects to → /reset-password (✅ correct)
   - NOT: /auth/callback redirects to → /login (❌ old broken behavior)

#### Step 5: Set Password
1. You should see password reset form with:
   - Password input
   - "Update Password" button
   - Message: "Account has been unlocked..."
   - Footer: "Create passwords that are at least 8 characters with an uppercase letter, number, and lowercase letter"

2. Enter valid password:
   ```
   Examples that work: AaaBbb123, TestPass99, MyPass1234
   Examples that fail: password, 12345678, Passw0rd (all lowercase)
   ```

3. Click "Update Password"

4. Should see: "Password updated successfully. Redirecting to dashboard..."

5. After 2 seconds: Auto-redirects to /dashboard

---

## 🔍 Debugging

### Check Callback Route Logs

**In terminal where `npm run dev` is running, look for:**

```
[auth/callback] params: {
  code: false,
  token_hash: 'abc123xyz...',
  type: 'recovery',
  error: null,
  error_code: null,
  error_description: null
}
[auth/callback] verifying OTP with type: recovery
[auth/callback] verifyOtp result: { success: true, error: null }
```

### If Parameters Are Missing

If you see:
```
[auth/callback] params: {
  code: false,
  token_hash: null,    ← PROBLEM
  type: null,          ← PROBLEM
  error: null,
  ...
}
[auth/callback] no code or token_hash, redirecting to login
```

Then Supabase isn't sending the expected parameters. Possible causes:
1. Recovery link format changed in newer Supabase SDK version
2. Email client is modifying the URL
3. Supabase account settings default behavior changed

### If verifyOtp Fails

If you see:
```
[auth/callback] verifyOtp result: { 
  success: false, 
  error: "invalid_grant" 
}
```

Then:
1. Token may have expired (recovery links expire after 1 hour)
2. Token format might not match what verifyOtp expects
3. Session may already exist and conflicting

---

## 📊 Expected URLs

### Email Links Should Look Like:
```
https://1nelink.app/auth/callback?token_hash=LONGSTRINGHERE&type=recovery
```

### Browser Redirect Chain:
```
1. Click: https://1nelink.app/auth/callback?token_hash=...&type=recovery
2. Server processes at: GET /auth/callback?[params]
3. Verifies token and session
4. Redirects to: https://1nelink.app/reset-password
5. Form shows password input
6. On success: auto-redirects to https://1nelink.app/dashboard
```

---

## ✨ Success Criteria

✅ Password reset form is visible (not login page)
✅ Console shows "[auth/callback] verifying OTP with type: recovery"
✅ verifyOtp shows success: true
✅ Password update works
✅ Auto-redirects to dashboard
✅ New account is created with is_creator = true
✅ User can access creator features immediately

---

## 🆘 If Test Fails

1. **Check server logs** for [auth/callback] messages
2. **Check email** - was it sent? (check spam folder)
3. **Verify Supabase project** - is it the right one?
4. **Check NEXT_PUBLIC_SITE_URL** - is it correct in .env.local?
5. **Check database** - was user account created? Is user_id set?
6. **Check profiles table** - is is_creator set to true?
7. **Manual URL test** - try navigating directly to /reset-password after setting a session

---

## 📝 Related Files

- Route handler: [src/app/auth/callback/route.ts](src/app/auth/callback/route.ts)
- Approval logic: [src/app/api/admin/creators/review/route.ts](src/app/api/admin/creators/review/route.ts)
- Password form: [src/app/reset-password/page.tsx](src/app/reset-password/page.tsx)
- Email template: [src/lib/email/eliteCreatorEmails.ts](src/lib/email/eliteCreatorEmails.ts)
- Email service: [src/lib/emailService.ts](src/lib/emailService.ts)
