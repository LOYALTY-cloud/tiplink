-- COPY AND PASTE THIS INTO YOUR SUPABASE SQL EDITOR
-- Go to: https://supabase.com/dashboard/project/cjakxygbgijsknoadrrs/sql/new
--
-- PURPOSE: Ensure disputes tables are enabled for Supabase Realtime.
-- TABLES: tip_intents, dispute_approvals, dispute_assignments

alter table public.tip_intents replica identity full;
alter table public.dispute_approvals replica identity full;
alter table public.dispute_assignments replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tip_intents'
  ) then
    alter publication supabase_realtime add table public.tip_intents;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'dispute_approvals'
  ) then
    alter publication supabase_realtime add table public.dispute_approvals;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'dispute_assignments'
  ) then
    alter publication supabase_realtime add table public.dispute_assignments;
  end if;
end $$;
