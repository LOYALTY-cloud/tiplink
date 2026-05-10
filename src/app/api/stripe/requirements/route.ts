import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe/server";

export const runtime = "nodejs";

function toLabel(requirement: string): string {
  if (/^interv_[A-Za-z0-9]+(\.|$)/.test(requirement)) {
    if (requirement.includes("supportability_rejection_appeal")) {
      return "Supportability rejection appeal (Stripe Support review)";
    }
    if (requirement.includes("business_model_verification")) {
      return "Business model verification (Stripe Support review)";
    }
    return "Stripe Support review in progress";
  }

  const explicitMap: Record<string, string> = {
    "individual.address.line1": "Home address",
    "individual.address.city": "City",
    "individual.address.state": "State/Province",
    "individual.address.postal_code": "Postal code",
    "individual.phone": "Phone number",
    "individual.dob.day": "Date of birth",
    "individual.dob.month": "Date of birth",
    "individual.dob.year": "Date of birth",
    "individual.id_number": "Government ID number",
    "individual.verification.document": "Identity document",
    "individual.verification.document.front": "Identity document (front)",
    "individual.verification.document.back": "Identity document (back)",
    "individual.verification.additional_document": "Additional identity document",
    "business_profile.mcc": "Business category",
    "business_profile.url": "Business website",
    "external_account": "Bank account details",
    "tos_acceptance.date": "Accept Stripe Terms of Service",
    "tos_acceptance.ip": "Accept Stripe Terms of Service",
  };

  if (explicitMap[requirement]) return explicitMap[requirement];

  return requirement
    .split(".")
    .map((segment) => segment.replace(/_/g, " "))
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" - ");
}

function formatDisabledReason(reason: string | null): string | null {
  if (!reason) return null;

  const map: Record<string, string> = {
    "rejected.terms_of_service": "Rejected by Stripe due to Terms of Service restrictions. This usually requires a Stripe Support review or appeal.",
    "requirements.past_due": "Your Stripe account has overdue verification requirements.",
    "requirements.pending_verification": "Stripe is still reviewing previously submitted verification details.",
    "listed": "Your account is currently restricted by Stripe and requires support review.",
  };

  if (map[reason]) return map[reason];

  return reason
    .split(".")
    .map((segment) => segment.replace(/_/g, " "))
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" - ");
}

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!jwt) return NextResponse.json({ error: "Missing auth" }, { status: 401 });

    const supabaseUser = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${jwt}` } } }
    );

    const { data: userRes, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !userRes.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = userRes.user.id;

    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("stripe_account_id, last_stripe_requirements_notified_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (profileErr) {
      console.error("stripe/requirements profile", profileErr);
      return NextResponse.json({ error: "Failed to load profile" }, { status: 500 });
    }

    if (!profile?.stripe_account_id) {
      return NextResponse.json({
        connected: false,
        needs_verification: false,
        currently_due: [],
        future_due: [],
      });
    }

    const acct = await stripe.accounts.retrieve(profile.stripe_account_id);

    const currentlyDue = acct.requirements?.currently_due ?? [];
    const futureDue = acct.future_requirements?.currently_due ?? [];
    const pendingVerification = acct.requirements?.pending_verification ?? [];
    const disabledReason = acct.requirements?.disabled_reason ?? null;
    const disabledReasonLabel = formatDisabledReason(disabledReason);

    const needsVerification = currentlyDue.length > 0 || !!disabledReason || !acct.payouts_enabled;

    // Deduplicate labels (e.g. tos_acceptance.date + tos_acceptance.ip both map to the same label)
    const deduped = (fields: string[]) => [...new Set(fields.map(toLabel))];

    return NextResponse.json({
      connected: true,
      charges_enabled: !!acct.charges_enabled,
      payouts_enabled: !!acct.payouts_enabled,
      details_submitted: !!acct.details_submitted,
      needs_verification: needsVerification,
      currently_due: currentlyDue,
      currently_due_labels: deduped(currentlyDue),
      future_due: futureDue,
      future_due_labels: deduped(futureDue),
      pending_verification: pendingVerification,
      pending_verification_labels: deduped(pendingVerification),
      disabled_reason: disabledReason,
      disabled_reason_label: disabledReasonLabel,
      last_notified_at: profile.last_stripe_requirements_notified_at ?? null,
    });
  } catch (e) {
    console.error("stripe/requirements error:", e);
    return NextResponse.json({ error: "Failed to load verification requirements" }, { status: 500 });
  }
}
