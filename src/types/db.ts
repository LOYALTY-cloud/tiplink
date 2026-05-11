export interface ProfileRow {
  id: string;
  user_id: string;
  stripe_account_status?: "verified" | "incomplete" | "disconnected";
  stripe_customer_id?: string | null;
  stripe_account_id?: string | null;
  stripe_charges_enabled?: boolean | null;
  email?: string | null;
  payouts_enabled?: boolean | null;
  stripe_payouts_enabled?: boolean | null;
  stripe_onboarding_complete?: boolean | null;
  handle?: string | null;
  display_name?: string | null;
  bio?: string | null;
  location?: string | null;
  avatar_url?: string | null;
  banner_url?: string | null;
  handle_change_count?: number | null;
  handle_change_window_start?: string | null;
  created_at?: string;
  role?: "owner" | "super_admin" | "finance_admin" | "support_admin" | "user" | "system" | null;
  is_flagged?: boolean | null;
  account_status?: "active" | "restricted" | "suspended" | "closed" | "closed_finalized" | null;
  status_reason?: string | null;
  closed_at?: string | null;
  owed_balance?: number | null;
  first_name?: string | null;
  last_name?: string | null;
  admin_id?: string | null;
  availability?: "online" | "busy" | "offline" | null;
  email_verified?: boolean | null;
  last_active_at?: string | null;
  handle_locked_until?: string | null;
  theme?: string | null;

  // Freeze system
  is_frozen?: boolean | null;
  freeze_reason?: string | null;
  frozen_at?: string | null;
  freeze_level?: "soft" | "hard" | null;

  // Trust & risk scoring
  trust_score?: number | null;
  risk_level?: string | null;
  last_risk_check?: string | null;
  risk_score?: number | null;
  admin_risk_score?: number | null;
  admin_risk_level?: string | null;
  last_fraud_score?: number | null;
  last_flagged_at?: string | null;

  // Restriction & verification
  restriction_count?: number | null;
  restricted_until?: string | null;
  is_verified?: boolean | null;
  kyc_status?: "none" | "pending" | "approved" | "rejected" | null;
  dob?: string | null;
  full_name?: string | null;
  verification_required?: boolean | null;
  verification_reason?: string | null;
  verification_uploads_today?: number | null;
  verification_uploads_date?: string | null;

  // Withdrawal & payout
  withdrawal_locked?: boolean | null;
  payout_hold_until?: string | null;
  daily_withdrawn?: number | null;
  withdrawal_limit_override?: boolean | null;
  successful_payouts?: number | null;
  total_volume?: number | null;

  // Fraud / velocity tracking
  last_ip?: string | null;
  last_device?: string | null;
  velocity_score?: number | null;

  // Admin
  invite_status?: string | null;
  is_active?: boolean | null;
  admin_passcode?: string | null;

  // Profile extras
  links?: unknown[] | null;
  creator_activity_category?: string | null;
  last_stripe_requirements_hash?: string | null;
  last_stripe_requirements_notified_at?: string | null;
  stripe_restriction_state?: "safe" | "restricted" | "high_risk" | "disconnected" | null;
  stripe_verification_status?: "verified" | "pending" | "required" | "restricted" | "disconnected" | null;
  stripe_disabled_reason?: string | null;
  stripe_requirements_due_count?: number | null;
  stripe_future_requirements_due_count?: number | null;
  stripe_past_requirements_due_count?: number | null;
  stripe_connect_risk_reasons?: unknown[] | null;
  stripe_connect_last_event_at?: string | null;
  stripe_connect_last_event_type?: string | null;
}

export interface WalletRow {
  user_id: string;
  balance: number;
  available?: number | null;
  pending?: number | null;
  withdraw_fee?: number | null;
  currency?: string | null;
  created_at?: string;
}
