-- Fix creator_strikes RLS: previous policy was TO public (unauthenticated access).
-- Re-create as service_role only — creators should not be able to read raw strike records.

DROP POLICY IF EXISTS "creator_strikes: service role all" ON public.creator_strikes;

CREATE POLICY "creator_strikes: service_role only"
  ON public.creator_strikes
  AS PERMISSIVE FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Deny all other roles explicitly
REVOKE ALL ON public.creator_strikes FROM public, anon, authenticated;
GRANT ALL ON public.creator_strikes TO service_role;
