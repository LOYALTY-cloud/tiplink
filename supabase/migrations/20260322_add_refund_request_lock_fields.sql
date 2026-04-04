-- Add in-flight lock fields to refund_requests for concurrent execution protection
ALTER TABLE refund_requests
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locked_by UUID;
