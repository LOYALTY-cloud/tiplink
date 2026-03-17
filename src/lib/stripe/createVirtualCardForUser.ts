import type Stripe from "stripe";

// Adapt existing helper that creates card + cardholder for a user
import createUserWithCard from "@/lib/createUser";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function createVirtualCardForUser(stripeAccountId: string) {
  // Look up profile by connected Stripe account id
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, user_id, email, stripe_card_id, identity_verified, stripe_onboarding_complete")
    .eq("stripe_account_id", stripeAccountId)
    .maybeSingle();

  if (!profile) return;

  // Safety: only create cards for verified/onboarded users
  if (!profile.identity_verified && !profile.stripe_onboarding_complete) return;

  // Already has card
  if (profile.stripe_card_id) return;

  // Delegate to existing user-card creation logic
  try {
    await createUserWithCard(profile.user_id, profile.email);
    console.log(`Virtual card created for user ${profile.user_id}`);
  } catch (err) {
    console.error("Failed to create virtual card for user:", err);
  }
}

export default createVirtualCardForUser;
