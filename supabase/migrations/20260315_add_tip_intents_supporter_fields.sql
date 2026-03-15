-- Add supporter identifiers to tip_intents for fraud checks
alter table if exists tip_intents
add column if not exists supporter_user_id uuid,
add column if not exists supporter_ip text;

create index if not exists idx_tip_intents_supporter_user
on tip_intents(supporter_user_id);

create index if not exists idx_tip_intents_supporter_ip
on tip_intents(supporter_ip);
