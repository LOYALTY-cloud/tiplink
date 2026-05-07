-- Fix get_tip_receipt: was querying 'tips' but data lives in 'tip_intents'.
-- Replaces the function to return all fields needed by /r/[receiptId] page.

CREATE OR REPLACE FUNCTION public.get_tip_receipt(rid text)
RETURNS TABLE (
  receipt_id        text,
  amount            numeric,
  platform_fee      numeric,
  status            text,
  created_at        timestamptz,
  creator_user_id   uuid,
  creator_handle    text,
  creator_display_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ti.receipt_id::text,
    ti.tip_amount            AS amount,
    ti.platform_fee,
    ti.status,
    ti.created_at,
    ti.creator_user_id,
    p.handle                 AS creator_handle,
    COALESCE(p.display_name, p.handle) AS creator_display_name
  FROM tip_intents ti
  LEFT JOIN profiles p ON p.user_id = ti.creator_user_id
  WHERE ti.receipt_id::text = rid
  LIMIT 1;
$$;

-- Ensure anon + authenticated can call it
GRANT EXECUTE ON FUNCTION public.get_tip_receipt(text) TO anon, authenticated;
