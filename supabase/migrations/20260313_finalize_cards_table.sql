-- Finalize cards table: ensure required columns and updated_at trigger

alter table public.cards
  add column if not exists stripe_cardholder_id text;

alter table public.cards
  add column if not exists updated_at timestamptz default now();

create index if not exists idx_cards_user on public.cards(user_id);
create unique index if not exists idx_cards_user_unique on public.cards(user_id);

-- Trigger function to update `updated_at` on row update
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_updated_at on public.cards;
create trigger set_updated_at
  before update on public.cards
  for each row
  execute function public.set_updated_at();
