-- Add weekly and monthly spending limits to cards
alter table cards
add column if not exists weekly_limit numeric default 5000,
add column if not exists monthly_limit numeric default 20000;

create index if not exists idx_cards_weekly_limit
on cards(weekly_limit);
