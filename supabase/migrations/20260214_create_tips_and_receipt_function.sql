-- Ensure tips table exists with all necessary columns
-- Note: get_tip_receipt function already exists in database

-- Add receipt_id column if it doesn't exist
alter table if exists tips
  add column if not exists receipt_id text unique;

-- Add other columns that may be missing
alter table if exists tips
  add column if not exists tipper_name text,
  add column if not exists receipt_email text,
  add column if not exists platform_fee numeric(10, 2) default 0,
  add column if not exists net numeric(10, 2),
  add column if not exists note text,
  add column if not exists status text default 'pending',
  add column if not exists receipt_sent_at timestamptz;

-- Add indexes for performance if they don't exist
create index if not exists tips_receiver_user_id_idx on tips(receiver_user_id);
create index if not exists tips_receipt_id_idx on tips(receipt_id);
create index if not exists tips_created_at_idx on tips(created_at desc);
create index if not exists tips_status_idx on tips(status);

-- Ensure RLS is enabled
alter table tips enable row level security;

-- Create policies if they don't exist (will fail silently if they do)
do $$
begin
  if not exists (
    select 1 from pg_policies 
    where tablename = 'tips' 
    and policyname = 'Users can view their received tips'
  ) then
    create policy "Users can view their received tips"
      on tips for select
      using (auth.uid() = receiver_user_id);
  end if;
end $$;
