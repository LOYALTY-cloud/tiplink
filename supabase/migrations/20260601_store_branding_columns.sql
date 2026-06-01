-- Add avatar_url and banner_url branding columns to creator_stores.
-- These are uploaded via /api/store/upload-asset and stored as public CDN URLs.

alter table public.creator_stores
  add column if not exists avatar_url text,
  add column if not exists banner_url text;

comment on column public.creator_stores.avatar_url is 'Public CDN URL for the store avatar image (uploaded to store-assets bucket).';
comment on column public.creator_stores.banner_url is 'Public CDN URL for the store banner image (uploaded to store-assets bucket).';
