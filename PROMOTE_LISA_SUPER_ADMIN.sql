-- Promote Lisa Francois to super_admin
-- Run this in the Supabase SQL editor.
--
-- Finds Lisa's admin row by matching first_name + last_name on the linked
-- profiles row, then updates the admins.role column.

UPDATE public.admins
SET role = 'super_admin'
WHERE user_id = (
  SELECT user_id
  FROM public.profiles
  WHERE lower(first_name) = 'lisa'
    AND lower(last_name)  = 'francois'
  LIMIT 1
);
