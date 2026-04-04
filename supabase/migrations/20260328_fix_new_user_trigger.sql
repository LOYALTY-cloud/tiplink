-- FIX: "Database error saving new user"
--
-- Root cause: a trigger on auth.users inserts into wallets BEFORE profiles exists,
-- violating the wallets.user_id FK → profiles(user_id).
--
-- This migration replaces the existing trigger with one that creates
-- the profiles row FIRST, then wallets and user_settings.
--
-- RUN THIS IN THE SUPABASE SQL EDITOR.

-- 1. Drop any existing trigger on auth.users for new user setup
drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists handle_new_user on auth.users;
drop trigger if exists create_user_resources on auth.users;
drop trigger if exists on_auth_user_created_wallet on auth.users;
drop trigger if exists on_auth_user_created_settings on auth.users;

-- Clean up old per-resource functions
drop function if exists public.handle_new_user_wallet();
drop function if exists public.handle_new_user_settings();

-- 2. Create or replace the function that handles new user creation
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Create profiles row first (other tables FK to this)
  insert into public.profiles (user_id, handle, email)
  values (
    new.id,
    new.id::text,
    new.email
  )
  on conflict (user_id) do nothing;

  -- Create wallets row (FKs to profiles)
  insert into public.wallets (user_id, balance, available, pending)
  values (new.id, 0, 0, 0)
  on conflict (user_id) do nothing;

  -- Create user_settings row (FKs to profiles)
  insert into public.user_settings (user_id, notify_tips, notify_payouts, notify_security)
  values (new.id, true, true, true)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

-- 3. Create the trigger
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
