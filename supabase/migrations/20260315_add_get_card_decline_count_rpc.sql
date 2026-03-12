-- RPC to count recent declines for a user
create or replace function public.get_card_decline_count(p_user_id uuid, p_window_seconds int)
returns table(count int)
language sql
as $$
  select count(*)::int as count
  from public.card_declines
  where user_id = p_user_id
    and created_at >= now() - (p_window_seconds || ' seconds')::interval;
$$;
