-- READ-ONLY verification checks for disputes realtime setup.

select
  'tip_intents in realtime publication' as check_name,
  exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tip_intents'
  ) as ok;

select
  'dispute_approvals in realtime publication' as check_name,
  exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'dispute_approvals'
  ) as ok;

select
  'dispute_assignments in realtime publication' as check_name,
  exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'dispute_assignments'
  ) as ok;

select
  'tip_intents replica identity full' as check_name,
  (select relreplident = 'f' from pg_class where oid = 'public.tip_intents'::regclass) as ok;

select
  'dispute_approvals replica identity full' as check_name,
  (select relreplident = 'f' from pg_class where oid = 'public.dispute_approvals'::regclass) as ok;

select
  'dispute_assignments replica identity full' as check_name,
  (select relreplident = 'f' from pg_class where oid = 'public.dispute_assignments'::regclass) as ok;
