-- Enable RLS on reserved_handles and vanity_handles
-- Both are lookup/seed tables: public SELECT, writes via service role only

-- reserved_handles
ALTER TABLE public.reserved_handles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read reserved_handles"
  ON public.reserved_handles
  FOR SELECT
  USING (true);

-- vanity_handles
ALTER TABLE public.vanity_handles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read vanity_handles"
  ON public.vanity_handles
  FOR SELECT
  USING (true);
