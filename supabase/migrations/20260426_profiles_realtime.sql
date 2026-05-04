-- Enable realtime on profiles so the dashboard drawer can react instantly
-- when is_creator is flipped by an admin (creator approval flow).
-- Uses REPLICA IDENTITY FULL so postgres_changes payload includes all columns.

alter table public.profiles replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end $$;
