export {};

type RefundRequest = {
  id: string;
  status: "pending" | "approved" | "rejected";
  required_approvals: number;
  locked_at: string | null;
  locked_by: string | null;
};

type Vote = {
  refund_id: string;
  admin_id: string;
};

type AttemptResult = {
  ok: boolean;
  executed: boolean;
  status: number;
  error?: string;
};

class MockRefundEngine {
  private refund: RefundRequest;
  private votes: Vote[] = [];

  constructor(requiredApprovals = 2) {
    this.refund = {
      id: "refund-1",
      status: "pending",
      required_approvals: requiredApprovals,
      locked_at: null,
      locked_by: null,
    };
  }

  get state() {
    return {
      refund: { ...this.refund },
      votes: [...this.votes],
    };
  }

  private hasVote(adminId: string): boolean {
    return this.votes.some((v) => v.refund_id === this.refund.id && v.admin_id === adminId);
  }

  private insertVote(adminId: string): void {
    if (!this.hasVote(adminId)) {
      this.votes.push({ refund_id: this.refund.id, admin_id: adminId });
    }
  }

  private countVotes(): number {
    return this.votes.filter((v) => v.refund_id === this.refund.id).length;
  }

  // Mimics: update refund_requests set locked_at, locked_by where id=? and locked_at is null
  private tryAcquireLock(adminId: string): boolean {
    if (this.refund.locked_at !== null) return false;
    this.refund.locked_at = new Date().toISOString();
    this.refund.locked_by = adminId;
    return true;
  }

  private releaseLock(): void {
    this.refund.locked_at = null;
    this.refund.locked_by = null;
  }

  // Simulates approval route behavior after enough votes are present.
  async approve(adminId: string, opts?: { failAfterLock?: boolean; delayMs?: number }): Promise<AttemptResult> {
    if (this.refund.status !== "pending") {
      return { ok: false, executed: false, status: 400, error: `Request already ${this.refund.status}` };
    }

    this.insertVote(adminId);

    if ((opts?.delayMs ?? 0) > 0) {
      await new Promise((resolve) => setTimeout(resolve, opts?.delayMs ?? 0));
    }

    const voteCount = this.countVotes();
    if (voteCount < this.refund.required_approvals) {
      return { ok: true, executed: false, status: 200 };
    }

    const lockOk = this.tryAcquireLock(adminId);
    if (!lockOk) {
      return {
        ok: false,
        executed: false,
        status: 409,
        error: "Refund request is already being executed by another admin",
      };
    }

    if (opts?.failAfterLock) {
      // Mimics early/Stripe failure path that must release lock.
      this.releaseLock();
      return { ok: false, executed: false, status: 400, error: "Stripe refund failed" };
    }

    // Success path: mark approved and release lock.
    this.refund.status = "approved";
    this.releaseLock();
    return { ok: true, executed: true, status: 200 };
  }
}

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function testTwoAdminsSingleWinner(): Promise<void> {
  const engine = new MockRefundEngine(2);

  // Admin A places first vote.
  const firstVote = await engine.approve("admin-a");
  assert(firstVote.ok && !firstVote.executed, "First vote should record but not execute");

  // Admin B reaches threshold and begins execution.
  const secondVote = await engine.approve("admin-b", { delayMs: 5 });
  assert(secondVote.ok && secondVote.executed, "Second vote should execute refund");

  // Admin A attempts again after completion (simulating race/late submit).
  const lateAttempt = await engine.approve("admin-a");
  assert(!lateAttempt.ok && lateAttempt.status === 400, "Late attempt should be rejected as already approved");

  const snapshot = engine.state;
  assert(snapshot.refund.status === "approved", "Refund request should be approved");
  assert(snapshot.refund.locked_at === null && snapshot.refund.locked_by === null, "Lock must be released after success");
}

async function testLockReleaseOnFailureThenRetry(): Promise<void> {
  const engine = new MockRefundEngine(2);

  await engine.approve("admin-a");

  // Admin B hits threshold, acquires lock, then fails (e.g. Stripe error).
  const failedExec = await engine.approve("admin-b", { failAfterLock: true });
  assert(!failedExec.ok && failedExec.status === 400, "Failed execution should return error");

  // Request remains pending but lock must be released for retry.
  const afterFailure = engine.state;
  assert(afterFailure.refund.status === "pending", "Request should remain pending after failure");
  assert(afterFailure.refund.locked_at === null && afterFailure.refund.locked_by === null, "Lock must be released after failure");

  // Retry by another admin must succeed.
  const retryExec = await engine.approve("admin-c");
  assert(retryExec.ok && retryExec.executed, "Retry should succeed after lock release");

  const finalState = engine.state;
  assert(finalState.refund.status === "approved", "Request should end approved after retry");
  assert(finalState.refund.locked_at === null && finalState.refund.locked_by === null, "Lock must be released at end");
}

async function run(): Promise<void> {
  await testTwoAdminsSingleWinner();
  await testLockReleaseOnFailureThenRetry();
  console.log("Refund two-admin concurrency test OK");
}

run().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
