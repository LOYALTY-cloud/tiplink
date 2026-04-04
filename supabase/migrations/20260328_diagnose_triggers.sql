-- STEP 1: Run this FIRST in Supabase SQL Editor to see what triggers exist on auth.users
-- Copy the results and share them.

SELECT
  tg.tgname   AS trigger_name,
  p.proname    AS function_name,
  n.nspname    AS function_schema,
  CASE tg.tgtype & 2  WHEN 2 THEN 'BEFORE' ELSE 'AFTER' END AS timing,
  CASE tg.tgtype & 28
    WHEN 4  THEN 'INSERT'
    WHEN 8  THEN 'DELETE'
    WHEN 16 THEN 'UPDATE'
    WHEN 20 THEN 'INSERT OR UPDATE'
    WHEN 28 THEN 'INSERT OR UPDATE OR DELETE'
    ELSE 'OTHER'
  END AS event
FROM pg_trigger tg
JOIN pg_class c  ON tg.tgrelid = c.oid
JOIN pg_namespace cn ON c.relnamespace = cn.oid
JOIN pg_proc p   ON tg.tgfoid = p.oid
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE cn.nspname = 'auth'
  AND c.relname = 'users'
  AND NOT tg.tgisinternal
ORDER BY tg.tgname;
