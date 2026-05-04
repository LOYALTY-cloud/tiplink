UPDATE profiles p
SET creator_tier = 'elite'
FROM elite_creator_applications e
WHERE e.user_id = p.user_id
  AND e.status = 'approved'
    AND (p.creator_tier IS NULL OR p.creator_tier != 'elite');
    