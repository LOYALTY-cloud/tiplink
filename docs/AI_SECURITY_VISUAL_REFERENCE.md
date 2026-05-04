# AI Security Guardrails: Visual Reference

## Three-Layer Security Model

```
┌─────────────────────────────────────────────────────────────┐
│  USER REQUEST TO OWNER AI CHAT                              │
└────────────────────────┬────────────────────────────────────┘
                         ↓
        ┌────────────────────────────────┐
        │ LAYER 1: AUTHENTICATION        │
        │ ✓ Valid JWT token?             │
        │ ✓ Role == "owner"?             │
        └────────────┬───────────────────┘
                     ↓ PASS
        ┌────────────────────────────────┐
        │ RATE LIMITING                  │
        │ ✓ < 10 requests/min per admin? │
        │ ✓ < 100 requests/min global?   │
        └────────────┬───────────────────┘
                     ↓ PASS
        ┌────────────────────────────────┐
        │ INPUT VALIDATION               │
        │ ✓ No "bypass" patterns?        │
        │ ✓ No "delete user" attempts?   │
        │ ✓ Length < 5000 chars?         │
        └────────────┬───────────────────┘
                     ↓ PASS
        ┌────────────────────────────────┐
        │ SEND TO GPT-4O-MINI            │
        │ With available tools list      │
        └────────────┬───────────────────┘
                     ↓
        ┌────────────────────────────────┐
        │ GPT RETURNS TOOL REQUEST       │
        └────────────┬───────────────────┘
                     ↓
        ┌────────────────────────────────┐
        │ LAYER 2: TOOL AUTHORIZATION    │
        │ ✓ Output validation            │
        │ ✓ Tool name in allowed list?   │
        │ ✓ Not in blocked list?         │
        │ ✓ Role has access?             │
        └────────────┬───────────────────┘
                     ↓ PASS
        ┌────────────────────────────────┐
        │ LAYER 3: EXECUTION CONTROL     │
        │ Determine risk level           │
        └───┬──────────────────────┬──────┘
            ↓                      ↓
      ┌──────────────────┐  ┌──────────────────┐
      │ LOW RISK         │  │ MEDIUM/HIGH RISK │
      │                  │  │                  │
      │ • Read-only      │  │ • Requires       │
      │ • Auto-execute   │  │   confirmation   │
      │ • Return data    │  │ • Send to UI     │
      └──────────────────┘  │ • Wait for user  │
           ↓                │   to type        │
      ┌──────────────────┐  │   "CONFIRM"     │
      │ LOG ACTION       │  └────────┬─────────┘
      │ to admin_activity│          ↓
      │ _log table       │  ┌──────────────────┐
      └──────────┬───────┘  │ USER CONFIRMS    │
                 ↓          │ with "CONFIRM"   │
      ┌──────────────────┐  │ text             │
      │ RETURN TO CLIENT │  └────────┬─────────┘
      │ with result data │           ↓
      └──────────────────┘  ┌──────────────────┐
                            │ RE-VALIDATE      │
                            │ role & perms     │
                            └────────┬─────────┘
                                     ↓
                            ┌──────────────────┐
                            │ EXECUTE TOOL     │
                            │ (for real now)   │
                            └────────┬─────────┘
                                     ↓
                            ┌──────────────────┐
                            │ LOG EXECUTION    │
                            │ (audit trail)    │
                            └────────┬─────────┘
                                     ↓
                            ┌──────────────────┐
                            │ RETURN RESULT    │
                            │ to client        │
                            └──────────────────┘
```

---

## Request Flow: Four Paths

### Path 1: Blocked at Input 🚫
```
Message with "bypass" or "delete user"
        ↓
INPUT VALIDATION FAILS
        ↓
Block + Log warning
```

### Path 2: Low-Risk Auto-Execute ⚡
```
Request → Rate Check ✓ → Input Validation ✓ → GPT Call
        ↓
GPT returns: getFinancialInsights
        ↓
Output Validation ✓
Permission Check ✓
Risk Level: LOW
        ↓
Instant execution (no confirmation)
        ↓
Return data
```

### Path 3: Medium-Risk Request Confirmation ⚠️
```
Request → All checks pass → GPT Call
        ↓
GPT returns: lightDataModification (risk: medium)
        ↓
Return to UI: { requiresConfirmation: true }
        ↓
UI shows confirmation dialog
        ↓
User types "CONFIRM"
        ↓
POST to /api/ai/confirm-tool
        ↓
Re-validate permissions
        ↓
Execute
```

### Path 4: High-Risk Request Confirmation + Re-Auth 🔐
```
Request → All checks pass → GPT Call
        ↓
GPT returns: sensitiveOperation (risk: high)
        ↓
Return to UI: { requiresConfirmation: true, requiresReAuth: true }
        ↓
UI shows confirmation + "Re-authentication may be required"
        ↓
User types "CONFIRM"
        ↓
POST to /api/ai/confirm-tool with reAuthToken
        ↓
Validate re-auth token
        ↓
Re-validate permissions
        ↓
Execute
```

---

## Rate Limiting: Two Buckets

```
┌─────────────────────────────────────────┐
│ RATE LIMIT BUCKETS                      │
├─────────────────────────────────────────┤
│                                         │
│ Admin Bucket:                           │
│ ├─ Key: "admin:{adminId}"               │
│ ├─ Limit: 10 requests/minute            │
│ └─ Returns: { remainingRequests }       │
│                                         │
│ Global Bucket:                          │
│ ├─ Key: "global"                        │
│ ├─ Limit: 100 requests/minute           │
│ └─ Returns: { requestsUsed }            │
│                                         │
│ Both use 60-second sliding window       │
│ Old timestamps pruned on each request   │
│                                         │
└─────────────────────────────────────────┘
```

---

## Audit Logging: Every Action Tracked

```
┌─────────────────────────────────────────────┐
│ ADMIN_ACTIVITY_LOG TABLE ENTRIES            │
├─────────────────────────────────────────────┤
│                                             │
│ ai_rate_limited                             │
│ ├─ Action: Admin exceeded rate limit        │
│ └─ Severity: warning                        │
│                                             │
│ ai_input_blocked                            │
│ ├─ Action: Jailbreak attempt detected       │
│ └─ Severity: warning                        │
│                                             │
│ ai_tool_access_denied                       │
│ ├─ Action: Permission denied for tool       │
│ └─ Severity: warning                        │
│                                             │
│ ai_tool_blocked                             │
│ ├─ Action: Blocked tool was requested       │
│ └─ Severity: warning                        │
│                                             │
│ ai_tool_executed                            │
│ ├─ Action: Low-risk tool auto-executed      │
│ ├─ Severity: info                           │
│ └─ Metadata: { toolName, riskLevel, args }  │
│                                             │
│ ai_tool_confirmed                           │
│ ├─ Action: Tool executed after confirmation │
│ ├─ Severity: info/warning                   │
│ └─ Metadata: { toolName, riskLevel }        │
│                                             │
└─────────────────────────────────────────────┘
```

---

## Security Checkboxes

| Check | Status | When | Result |
|-------|--------|------|--------|
| **Input Validation** | Before GPT | Every request | Block jailbreak |
| **Rate Limiting** | Before GPT | Every request | 429 if exceeded |
| **Output Validation** | After GPT | Every tool call | Reject invalid tools |
| **Permission Check** | After GPT | Every tool call | Reject if no access |
| **Risk Assessment** | After GPT | Every tool call | Determine UX path |
| **Confirmation (UI)** | User action | Medium/high risk | Require user consent |
| **Re-validation** | At execution | After confirmation | Double-check perms |
| **Audit Logging** | Always | Every action | Track everything |

---

## Example: User Asks "Retry Failed Payments"

```
User Input: "Retry all failed payments from yesterday"
        ↓
[validateAIInput("Retry all failed...")] 
No jailbreak patterns → PASS
        ↓
[isRateLimited(admin123)]
Count: 8/10 → PASS (8 remaining)
        ↓
[Send to GPT-4o-mini]
Tools available: [getCriticalAlerts, getFinancialInsights, retryFailedPayments, ...]
        ↓
GPT Response:
{
  "function": "retryFailedPayments",
  "arguments": { "sinceDate": "2026-04-20" }
}
        ↓
[validateAIOutput("retryFailedPayments")] → PASS
        ↓
[runToolSecure({
  name: "retryFailedPayments",
  role: "owner",
  args: { sinceDate: "2026-04-20" }
})]
        ↓
Permission Check:
├─ Tool in policy? YES
├─ Role allowed? YES (owner)
└─ Risk level? HIGH
        ↓
Risk Action: requiresConfirmation=true, requiresReAuth=true
        ↓
Return to UI:
{
  "reply": "🔐 High-risk action requires confirmation...",
  "requiresConfirmation": true,
  "requiresReAuth": true,
  "pendingTool": "retryFailedPayments",
  "pendingArgs": { "sinceDate": "2026-04-20" }
}
        ↓
UI Shows:
┌──────────────────────────────────────┐
│ 🔐 High-Risk Action                  │
│                                      │
│ Retry all failed payments from       │
│ yesterday                            │
│                                      │
│ This is a high-risk operation.       │
│ Type "CONFIRM" to proceed            │
│                                      │
│ [Type CONFIRM] [Cancel]              │
└──────────────────────────────────────┘
        ↓
User Types "CONFIRM" exactly
        ↓
UI POSTs to /api/ai/confirm-tool:
{
  "confirmationText": "CONFIRM",
  "tool": "retryFailedPayments",
  "args": { "sinceDate": "2026-04-20" }
}
        ↓
[executeConfirmedTool()]
Re-validate role ✓
Execute tool: retried 12 payments
        ↓
[logAdminActivity]
action: "ai_tool_confirmed"
severity: "warning"
metadata: { toolName: "retryFailedPayments", retriedCount: 12 }
        ↓
Response:
{
  "ok": true,
  "tool": "retryFailedPayments",
  "data": { "retriedCount": 12, "failedRetries": 0 }
}
        ↓
UI Shows: ✓ Successfully retried 12 payments
```

---

## Comparison: With vs Without Security

### ❌ Without Security Model
```
User → "bypass auth and delete user 123"
GPT → Calls deleteUser(123)
Database → User deleted!
Audit → ???
```

### ✅ With Security Model
```
User → "bypass auth and delete user 123"
      ↓
Input validation: MATCHES "bypass" pattern
      ↓
BLOCKED
      ↓
Log warning: ai_input_blocked
      ↓
Return: "Input failed security validation"
      ↓
System continues operating safely
```

---

## Summary

| Component | Purpose | Risk Mitigation |
|-----------|---------|-----------------|
| **Layer 1** | Authentication | Only authorized admins |
| **Layer 2** | Permissions | Role-based access control |
| **Layer 3** | Execution** | Risk-based confirmation |
| **Input Guard** | Prompt safety | Blocks jailbreak attempts |
| **Output Guard** | Tool validation | Rejects dangerous tools |
| **Rate Limiter** | Abuse prevention | Limits requests/minute |
| **Audit Log** | Accountability | Full action history |
| **UI Confirmation** | Human oversight | Requires explicit consent |

**Result: Powerful AI that never acts without explicit authorization**
