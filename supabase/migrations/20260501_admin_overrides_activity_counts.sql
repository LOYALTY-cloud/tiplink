-- Aggregated activity counts for override feed enrichment.

CREATE OR REPLACE FUNCTION get_override_user_activity_counts(user_ids UUID[])
RETURNS TABLE (
  creator_user_id UUID,
  dispute_count BIGINT,
  refund_count BIGINT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    ti.creator_user_id,
    COUNT(*) FILTER (WHERE ti.status = 'disputed') AS dispute_count,
    COUNT(*) FILTER (WHERE ti.refund_status <> 'none') AS refund_count
  FROM tip_intents ti
  WHERE ti.creator_user_id = ANY(user_ids)
  GROUP BY ti.creator_user_id;
$$;
