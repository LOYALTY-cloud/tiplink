-- Enable realtime streaming for disputes operations.
-- This supports live updates in /admin/disputes for case status,
-- approvals, and claim assignment changes.

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
