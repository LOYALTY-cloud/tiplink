-- Enable row level security and policies for the profiles table
alter table profiles enable row level security;

-- Allow anyone to read profiles
create policy "Profiles are viewable by everyone"
on profiles
for select
using (true);

-- Allow users to insert their own profile row (use `user_id` column)
create policy "Users can insert their own profile"
on profiles
for insert
with check (auth.uid() = user_id);

-- Allow users to update their own profile row (use `user_id` column)
create policy "Users can update their own profile"
on profiles
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Ensure existing auth users have a profiles row (populate `user_id`)
insert into profiles (user_id)
select id from auth.users
where id not in (select user_id from profiles);
-- NOTE: storage.objects is owned by the Supabase storage extension and in
-- many managed projects you cannot ALTER or CREATE policies on it via SQL
-- as your DB role is not the table owner. Create storage policies using
-- the Supabase dashboard instead:
-- 1. Open Supabase → Storage → Buckets → (avatars|banners) → Policies
-- 2. Add a policy to allow inserts when `auth.uid() = split_part(name, '/', 1)`
--    and similar policies for update/delete as needed.
-- If you control the DB owner role and want to apply policies via SQL,
-- run the storage-related SQL as the table owner instead.