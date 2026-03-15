-- Normalize user FKs to reference profiles.id for platform tables

-- 1) Add creator_profile_id to tip_intents and populate from profiles
alter table if exists tip_intents
add column if not exists creator_profile_id uuid;

update tip_intents
set creator_profile_id = p.id
from profiles p
where p.user_id = tip_intents.creator_user_id
  and tip_intents.creator_profile_id is null;

-- 2) Add FK on creator_profile_id -> profiles(id)
alter table if exists tip_intents
  drop constraint if exists tip_intents_creator_user_id_fkey;

alter table if exists tip_intents
  add constraint tip_intents_creator_profile_id_fkey foreign key (creator_profile_id) references profiles(id) on delete cascade;

-- Optional: make creator_profile_id not null if all rows were populated
-- alter table tip_intents alter column creator_profile_id set not null;

-- 3) Ensure wallet_locks.user_id references profiles(id)
alter table if exists wallet_locks
  drop constraint if exists wallet_locks_user_id_fkey;

alter table if exists wallet_locks
  add constraint wallet_locks_user_id_fkey foreign key (user_id) references profiles(id) on delete cascade;

-- 4) For transactions_ledger ensure it references profiles(id) (already expected)
alter table if exists transactions_ledger
  drop constraint if exists transactions_ledger_user_id_fkey;

alter table if exists transactions_ledger
  add constraint transactions_ledger_user_id_fkey foreign key (user_id) references profiles(id) on delete cascade;

-- NOTE: These changes add new FK constraints and rely on profiles table containing
-- corresponding rows for existing auth.users entries. Backfill profiles using
-- existing migrations or create profile rows for any missing users before
-- making columns NOT NULL.
