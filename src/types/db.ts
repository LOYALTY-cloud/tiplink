export interface ProfileRow {
  id: string;
  user_id: string;
  stripe_account_status?: "verified" | "incomplete" | "disconnected";
  stripe_card_id?: string | null;
  stripe_customer_id?: string | null;
  stripe_cardholder_id?: string | null;
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
  role?: string | null;
}

export interface CardRow {
  id: string;
  user_id: string;
  stripe_card_id: string;
  status: "active" | "frozen";
  daily_limit?: number | null;
  monthly_limit?: number | null;
  weekly_limit?: number | null;
  brand?: string | null;
  last4?: string | null;
  exp_month?: number | null;
  exp_year?: number | null;
  stripe_cardholder_id?: string | null;
  created_at: string;
}

export interface CardTransactionRow {
  id: string;
  user_id: string;
  stripe_authorization_id: string;
  merchant_name: string;
  amount: number;
  currency: string;
  status: "approved" | "declined";
  created_at: string;
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
