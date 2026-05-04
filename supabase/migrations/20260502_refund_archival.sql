-- Move completed refund requests out of the hot table while keeping history queryable.

CREATE TABLE IF NOT EXISTS refund_requests_archive (
  id uuid PRIMARY KEY,
  tip_intent_id uuid NOT NULL,
  requested_by uuid NOT NULL,
  amount numeric NOT NULL,
  status text NOT NULL,
  required_approvals int NOT NULL,
  requires_owner boolean NOT NULL,
  created_at timestamptz NOT NULL,
  
  CONSTRAINT refund_requests_archive_status_check CHECK (status IN ('pending', 'approved', 'rejected'))
);

-- Defensive hardening for environments where the table pre-existed without a PK/unique on id.
DO $$
DECLARE
  dup_count bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.refund_requests_archive'::regclass
      AND contype = 'p'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_class t ON t.oid = i.indrelid
    JOIN pg_class idx ON idx.oid = i.indexrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'refund_requests_archive'
      AND i.indisunique = true
      AND i.indkey::text = (
        SELECT attnum::text
        FROM pg_attribute
        WHERE attrelid = 'public.refund_requests_archive'::regclass
          AND attname = 'id'
          AND NOT attisdropped
      )
  ) THEN
    SELECT COUNT(*) INTO dup_count
    FROM (
      SELECT id
      FROM refund_requests_archive
      GROUP BY id
      HAVING COUNT(*) > 1
    ) d;

    IF dup_count = 0 THEN
      ALTER TABLE refund_requests_archive
      ADD CONSTRAINT refund_requests_archive_pkey PRIMARY KEY (id);
    ELSE
      RAISE WARNING 'refund_requests_archive has duplicate id values (%). Skipping PK add; archival function still uses NOT EXISTS fallback.', dup_count;
    END IF;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_refund_requests_archive_created_at_desc
  ON refund_requests_archive(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_refund_requests_archive_status_created_at_desc
  ON refund_requests_archive(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_refund_requests_archive_tip_created_at_desc
  ON refund_requests_archive(tip_intent_id, created_at DESC);

ALTER TABLE refund_requests_archive ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'refund_requests_archive'
      AND policyname = 'Service role full access on refund_requests_archive'
  ) THEN
    CREATE POLICY "Service role full access on refund_requests_archive"
      ON refund_requests_archive FOR ALL
      USING (auth.role() = 'service_role');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION move_archived_refund_requests_to_archive(
  retention_days INTEGER DEFAULT 60,
  batch_size INTEGER DEFAULT 5000
)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
DECLARE
  moved_count INTEGER;
BEGIN
  WITH candidates AS (
    SELECT id
    FROM refund_requests
    WHERE status IN ('approved', 'rejected')
      AND created_at < now() - make_interval(days => retention_days)
    ORDER BY created_at ASC
    LIMIT batch_size
  ),
  moved_rows AS (
    INSERT INTO refund_requests_archive (
      id,
      tip_intent_id,
      requested_by,
      amount,
      status,
      required_approvals,
      requires_owner,
      created_at
    )
    SELECT
      src.id,
      src.tip_intent_id,
      src.requested_by,
      src.amount,
      src.status,
      src.required_approvals,
      src.requires_owner,
      src.created_at
    FROM refund_requests src
    INNER JOIN candidates c ON c.id = src.id
    WHERE NOT EXISTS (
      SELECT 1
      FROM refund_requests_archive a
      WHERE a.id = src.id
    )
    RETURNING id
  ),
  deleted AS (
    DELETE FROM refund_requests active
    USING candidates
    WHERE active.id = candidates.id
    RETURNING active.id
  )
  SELECT COUNT(*) INTO moved_count FROM deleted;
  RETURN moved_count;
END;
$$;
