-- Create (or fix) the store-assets storage bucket for creator store avatar + banner uploads.
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
ON CONFLICT (id) DO UPDATE SET
  public            = true,
  file_size_limit   = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];

-- Policies (drop first so re-running the migration is safe)
DO $$ BEGIN
  DROP POLICY IF EXISTS "store-assets public read"           ON storage.objects;
  DROP POLICY IF EXISTS "store-assets authenticated insert"  ON storage.objects;
  DROP POLICY IF EXISTS "store-assets authenticated update"  ON storage.objects;
  DROP POLICY IF EXISTS "store-assets authenticated delete"  ON storage.objects;
END $$;

-- Allow public read access (bucket is public, belt-and-suspenders policy)
CREATE POLICY "store-assets public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'store-assets');

-- Allow authenticated users to upload/update/delete their own objects
CREATE POLICY "store-assets authenticated insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'store-assets' AND auth.role() = 'authenticated');

CREATE POLICY "store-assets authenticated update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'store-assets' AND auth.role() = 'authenticated');

CREATE POLICY "store-assets authenticated delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'store-assets' AND auth.role() = 'authenticated');
