export function canCreatorAcceptTips(profile) {
  return !!profile?.stripe_charges_enabled;
}

export function blockedReason(profile) {
  if (!profile) return "no_profile";
  if (!profile.stripe_account_id) return "no_account";
  if (!profile.stripe_onboarding_complete) return "onboarding_incomplete";
  if (!profile.stripe_charges_enabled) return "charges_disabled";
  return null;
}
