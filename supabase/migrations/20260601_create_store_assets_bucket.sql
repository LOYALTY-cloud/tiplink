-- Create the store-assets storage bucket for creator store avatar + banner uploads.
-- Public bucket: images are served directly via Supabase CDN URLs.
-- Upload/delete is enforced server-side via the service role key in the API route.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'store-assets',
  'store-assets',
  true,
  5242880, -- 5 MB
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access (bucket is public, but belt-and-suspenders policy)
CREATE POLICY "store-assets public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'store-assets');
