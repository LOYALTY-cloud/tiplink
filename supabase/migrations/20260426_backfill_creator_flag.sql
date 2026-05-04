-- Backfill is_creator=true for any user who has created themes
-- but was not formally approved through the application flow.
-- Safe to re-run (only updates rows where is_creator is not already true).

update public.profiles
set
  is_creator   = true,
  creator_tier = coalesce(creator_tier, 'basic')
where user_id in (
  select distinct user_id
  from public.themes
  where is_deleted = false
)
and (is_creator is null or is_creator = false);
