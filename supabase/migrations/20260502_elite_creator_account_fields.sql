-- Elite creator applications: support unauthenticated submissions.
-- Applicants don't have accounts yet; account is created on approval.

-- 1. Make user_id nullable (no account at apply time).
ALTER TABLE public.elite_creator_applications
  ALTER COLUMN user_id DROP NOT NULL;

-- Drop old NOT NULL foreign key reference and re-add as nullable.
-- (The FK itself is already nullable after DROP NOT NULL; just need to allow cascades on null.)

-- 2. Add display_name and handle collected on the last step of the form.
ALTER TABLE public.elite_creator_applications
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS handle text;

-- 3. Enforce one application per email address.
ALTER TABLE public.elite_creator_applications
  DROP CONSTRAINT IF EXISTS elite_creator_applications_email_unique;

ALTER TABLE public.elite_creator_applications
  ADD CONSTRAINT elite_creator_applications_email_unique UNIQUE (email);

-- 4. Update RLS insert policy: allow unauthenticated inserts (user_id will be null)
--    since these are pre-account applications. Service role is used by the API anyway
--    but we keep the policy correct for completeness.
DROP POLICY IF EXISTS "elite_creator_applications: insert own" ON public.elite_creator_applications;

CREATE POLICY "elite_creator_applications: insert own"
  ON public.elite_creator_applications
  FOR INSERT
  WITH CHECK (user_id IS NULL OR auth.uid() = user_id);
