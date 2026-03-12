-- Add links column to profiles table
-- Stores up to 5 URLs as jsonb array for generic social/website links

alter table public.profiles
  add column if not exists links jsonb default '[]'::jsonb;

-- Add comment for documentation
comment on column public.profiles.links is 'Array of up to 5 URLs for social/website links';
