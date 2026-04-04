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
