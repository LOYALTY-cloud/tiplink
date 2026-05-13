-- Drop social_links_type_check entirely — type is a display hint, not an enum.
-- Previously only allowed 5 types, blocking saves for any other social platform.

ALTER TABLE public.social_links
  DROP CONSTRAINT IF EXISTS social_links_type_check;
