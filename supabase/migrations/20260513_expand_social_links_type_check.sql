-- Expand social_links_type_check to include all types supported by detectSocialType
-- Previously only allowed: instagram, tiktok, x, youtube, website
-- This caused saves to fail for any other social platform

ALTER TABLE public.social_links
  DROP CONSTRAINT IF EXISTS social_links_type_check;

ALTER TABLE public.social_links
  ADD CONSTRAINT social_links_type_check CHECK (
    type IN (
      'instagram',
      'tiktok',
      'x',
      'youtube',
      'facebook',
      'snapchat',
      'twitch',
      'linkedin',
      'pinterest',
      'reddit',
      'discord',
      'spotify',
      'soundcloud',
      'github',
      'threads',
      'cashapp',
      'venmo',
      'paypal',
      'onlyfans',
      'kick',
      'tumblr',
      'secondlife',
      'roblox',
      'blackdragon',
      'website'
    )
  );
