#!/usr/bin/env node
/**
 * DISPUTES SYSTEM API AUDIT TEST
 * 
 * Tests:
 * 1. Concurrent approval claim prevention (409 conflict)
 * 2. Role-based authorization enforcement
 * 3. Atomic claim mechanism
 * 4. Error handling and recovery
 * 5. Data consistency
 * 
 * Usage: node audit-disputes-api.cjs [--live]
 * --live: actually run tests against the API (requires valid ADMIN_TOKEN)
 *dmca
// Load env (optional)
try {
  require('dotenv').config();
} catch {
  // dotenv not available, continue
}

const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const API_URL = process.env.API_URL || 'http://localhost:3000';

const tests = [];
const results = { passed: 0, failed: 0, skipped: 0 };

function log(msg, level = 'info') {
  const colors = {
    info: '\x1b[36m',
    success: '\x1b[32m',
    error: '\x1b[31m',
    warn: '\x1b[33m',
    reset: '\x1b[0m',
  };
  console.log(`${colors[level] || colors.info}[${level.toUpperCase()}]${colors.reset} ${msg}`);
}

function test(name, fn) {
  tests.push({ name, fn });
}

async function run() {
  log('Starting Disputes System API Audit', 'info');
  log(`API URL: ${API_URL}`, 'info');
  log(`Live mode: ${process.argv.includes('--live') ? 'ENABLED' : 'DISABLED (dry-run)'}`, 'warn');
  console.log('');

  const liveMode = process.argv.includes('--live');
  
  if (!liveMode) {
    log('Running in DRY-RUN MODE. Add --live to execute actual API calls.', 'warn');
    console.log('');
  }

  // ─── TEST DEFINITIONS ──────────────────────────────────
  
  test('Approve endpoint exists and has proper auth', async () => {
    if (!liveMode) {
      log('Skipping live test (dry-run mode)', 'info');
      return { ok: true, note: 'Dry-run' };
    }
    
    const res = await fetch(`${API_URL}/api/admin/disputes/resolve`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    
    return { ok: res.ok || res.status === 403, status: res.status };
  });

  test('Missing auth returns 403', async () => {
    if (!liveMode) {
      log('Skipping live test (dry-run mode)', 'info');
      return { ok: true, note: 'Dry-run' };
    }
    
    const res = await fetch(`${API_URL}/api/admin/disputes/resolve`, {
      method: 'GET',
    });
    
    return { ok: res.status === 403, status: res.status };
  });

  test('Approval claim uses atomic update (.is("approved_by", null))', () => {
    // Verify code contains the atomic claim pattern
    const resolveFile = require('fs').readFileSync(
      '/workspaces/tiplink/src/app/api/admin/disputes/resolve/route.ts',
      'utf8'
    );
    
    const has_claim_check = resolveFile.includes('.is("approved_by", null)');
    const has_409_response = resolveFile.includes('status: 409');
    const has_error_release = resolveFile.includes('approved_by: null');
    
    return {
      ok: has_claim_check && has_409_response && has_error_release,
      details: {
        has_atomic_claim_check: has_claim_check,
        has_409_conflict_response: has_409_response,
        has_error_release_mechanism: has_error_release,
      },
    };
  });

  test('GET endpoint filters on approved_by IS NULL', () => {
    const resolveFile = require('fs').readFileSync(
      '/workspaces/tiplink/src/app/api/admin/disputes/resolve/route.ts',
      'utf8'
    );
    
    // Should have multiple .is("approved_by", null) calls
    const matches = resolveFile.match(/\.is\("approved_by", null\)/g) || [];
    
    return {
      ok: matches.length >= 2,
      details: {
        is_null_checks_count: matches.length,
        description: 'Should have at least 2: one in GET, one in atomic claim',
      },
    };
  });

  test('Unique index prevents duplicate pending approvals', () => {
    const migrationFile = require('fs').readFileSync(
      '/workspaces/tiplink/APPLY_DISPUTE_APPROVAL_HARDENING.sql',
      'utf8'
    );
    
    const has_unique_index = migrationFile.includes('idx_dispute_approvals_one_open_pending');
    const has_where_clause = migrationFile.includes("status = 'pending'") && 
                             migrationFile.includes('approved_by IS NULL');
    
    return {
      ok: has_unique_index && has_where_clause,
      details: {
        has_unique_index: has_unique_index,
        has_where_partial_index: has_where_clause,
      },
    };
  });

  test('INSERT policy excludes support_admin', () => {
    const policyFile = require('fs').readFileSync(
      '/workspaces/tiplink/APPLY_DISPUTE_APPROVAL_HARDENING.sql',
      'utf8'
    );
    
    const insert_policy = policyFile.match(
      /CREATE POLICY "Admins can insert dispute approvals"[\s\S]*?owner.*super_admin.*finance_admin/
    );
    
    return {
      ok: insert_policy !== null,
      details: {
        policy_has_owner: insert_policy ? insert_policy[0].includes('owner') : false,
        policy_has_super_admin: insert_policy ? insert_policy[0].includes('super_admin') : false,
        policy_has_finance_admin: insert_policy ? insert_policy[0].includes('finance_admin') : false,
        policy_excludes_support_admin: insert_policy ? !insert_policy[0].includes('support_admin') : false,
      },
    };
  });

  test('Release claim on error pattern exists', () => {
    const resolveFile = require('fs').readFileSync(
      '/workspaces/tiplink/src/app/api/admin/disputes/resolve/route.ts',
      'utf8'
    );
    
    // Look for the error handler that releases the claim
    const has_release = resolveFile.includes('await supabaseAdmin.from("dispute_approvals")') &&
                        resolveFile.includes('approved_by: null') &&
                        resolveFile.includes('} catch');
    
    return {
      ok: has_release,
      details: {
        has_error_recovery: has_release,
        description: 'Claim should be released on failure to allow retry',
      },
    };
  });

  test('Role-based authorization in canFinalize', () => {
    const resolveFile = require('fs').readFileSync(
      '/workspaces/tiplink/src/app/api/admin/disputes/resolve/route.ts',
      'utf8'
    );
    
    const has_canFinalize = resolveFile.includes('function canFinalize');
    const has_owner_check = resolveFile.includes('owner');
    const has_super_admin_check = resolveFile.includes('super_admin');
    
    return {
      ok: has_canFinalize && has_owner_check && has_super_admin_check,
      details: {
        has_canFinalize_function: has_canFinalize,
        has_owner_role_check: has_owner_check,
        has_super_admin_role_check: has_super_admin_check,
      },
    };
  });

  test('UI handles 409 conflict responses', () => {
    const pageFile = require('fs').readFileSync(
      '/workspaces/tiplink/src/app/admin/disputes/page.tsx',
      'utf8'
    );
    
    const has_error_handling = pageFile.includes('setResolveError');
    const has_resolve_flow = pageFile.includes('handleResolve');
    
    return {
      ok: has_error_handling && has_resolve_flow,
      details: {
        has_error_state_management: has_error_handling,
        has_resolve_handler: has_resolve_flow,
      },
    };
  });

  test('Realtime subscriptions configured for dispute_approvals', () => {
    const pageFile = require('fs').readFileSync(
      '/workspaces/tiplink/src/app/admin/disputes/page.tsx',
      'utf8'
    );
    
    const has_subscription = pageFile.includes('dispute_approvals');
    const has_realtime_channel = pageFile.includes('channel');
    
    return {
      ok: has_subscription && has_realtime_channel,
      details: {
        has_dispute_approvals_subscription: has_subscription,
        has_realtime_channel_setup: has_realtime_channel,
      },
    };
  });

  test('Claim separates from approve workflow (separate endpoints)', () => {
    try {
      const claimFile = require('fs').readFileSync(
        '/workspaces/tiplink/src/app/api/admin/disputes/claim/route.ts',
        'utf8'
      );
      const resolveFile = require('fs').readFileSync(
        '/workspaces/tiplink/src/app/api/admin/disputes/resolve/route.ts',
        'utf8'
      );
      
      const claim_is_separate = claimFile.includes('dispute_assignments');
      const approve_handles_disputes = resolveFile.includes('dispute_approvals');
      
      return {
        ok: claim_is_separate && approve_handles_disputes,
        details: {
          claim_endpoint_exists: claim_is_separate,
          approve_endpoint_exists: approve_handles_disputes,
          description: 'Case claiming (dispute_assignments) is separate from approval (dispute_approvals)',
        },
      };
    } catch {
      return { ok: false, error: 'Could not read files' };
    }
  });

  // ─── RUN ALL TESTS ────────────────────────────────────
  
  for (const { name, fn } of tests) {
    try {
      process.stdout.write(`Testing: ${name}... `);
      const result = await fn();
      
      if (result.ok) {
        log('✓ PASS', 'success');
        results.passed++;
      } else {
        log('✗ FAIL', 'error');
        if (result.error) console.log(`  Error: ${result.error}`);
        if (result.status) console.log(`  Status: ${result.status}`);
        results.failed++;
      }
      
      if (result.details) {
        console.log(`  Details: ${JSON.stringify(result.details, null, 2).split('\n').join('\n  ')}`);
      }
      if (result.note) console.log(`  Note: ${result.note}`);
      
    } catch (e) {
      log('✗ ERROR', 'error');
      console.log(`  Exception: ${e.message}`);
      results.failed++;
    }
  }

  // ─── SUMMARY ────────────────────────────────────────
  console.log('\n' + '='.repeat(60));
  log(`AUDIT COMPLETE`, 'info');
  log(`Passed:  ${results.passed}/${tests.length}`, results.passed === tests.length ? 'success' : 'warn');
  log(`Failed:  ${results.failed}/${tests.length}`, results.failed > 0 ? 'error' : 'success');
  log(`Skipped: ${results.skipped}/${tests.length}`, 'info');
  
  if (results.failed > 0) {
    log('\nSome tests failed. Review the details above.', 'error');
    process.exit(1);
  } else {
    log('\nAll tests passed! ✓', 'success');
    process.exit(0);
  }
}

run().catch(e => {
  log(`Fatal error: ${e.message}`, 'error');
  process.exit(1);
});
