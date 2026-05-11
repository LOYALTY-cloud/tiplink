"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import type { WalletRow } from "@/types/db";
import LinkDebitCardModal from "@/components/LinkDebitCardModal";
import { EnablePayoutsModal } from "@/components/EnablePayoutsModal";
import WithdrawalTimer from "@/components/WithdrawalTimer";
import AnimatedBalance from "@/components/AnimatedBalance";
import FreezeBanner from "@/components/FreezeBanner";
import StripeRequirementsCenter from "@/components/StripeRequirementsCenter";
import { useToast } from "@/lib/useToast";
import { showGlobalToast } from "@/components/GlobalToast";
import { ToastStack } from "@/components/ToastStack";
import { fireConfetti } from "@/lib/confetti";
import { ui } from "@/lib/ui";
import { formatMoney, getWithdrawalFee } from "@/lib/walletFees";
import WalletLockScreen from "@/components/wallet/WalletLockScreen";

interface WithdrawalReceipt {
  withdrawal_id: string;
  amount: number;
  fee: number;
  net: number;
  payout_status: string;
  payout_method: string;
  message?: string;
  release_at?: string;
  created_at?: string;
  trust_tier?: string;
  trust_tier_label?: string;
  payout_delay_days?: number;
  instant_eligible?: boolean;
  payout_policy_reason?: string;
}

export default function WalletPage() {
  const [wallet, setWallet] = useState<{
    balance: number;
    withdraw_fee: number;
  } | null>(null);
  const [loadingWallet, setLoadingWallet] = useState(true);
  const [showEnableModal, setShowEnableModal] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [receipt, setReceipt] = useState<WithdrawalReceipt | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [todayEarnings, setTodayEarnings] = useState<number>(0);
  const [balanceFlash, setBalanceFlash] = useState(false);
  const [freezeState, setFreezeState] = useState<{
    is_frozen: boolean;
    freeze_reason: string | null;
    freeze_level: "soft" | "hard" | null;
    freeze_signals: string[];
  } | null>(null);
  const { toasts, show: showToast, dismiss } = useToast(4000);
  const router = useRouter();
  
  const [payout, setPayout] = useState<{
    id: string;
    brand: string | null;
    last4: string | null;
  } | null>(null);

  type PayoutMethod = {
    id: string;
    brand: string | null;
    last4: string | null;
    is_default: boolean;
    type: string | null;
    stripe_external_account_id: string | null;
    provider: string | null;
    provider_ref: string | null;
  };
  const [allMethods, setAllMethods] = useState<PayoutMethod[]>([]);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [settingDefaultId, setSettingDefaultId] = useState<string | null>(null);
  const [selectedMethodId, setSelectedMethodId] = useState<string | null>(null);

  const [showInsufficientModal, setShowInsufficientModal] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [withdrawErrorKind, setWithdrawErrorKind] = useState<"error" | "pending">("error");

  // Wallet 2FA lock state
  const [walletLocked, setWalletLocked] = useState<boolean | null>(null); // null = loading
  const [maskedEmail, setMaskedEmail] = useState<string>("");
  const [showBiometricSuggestion, setShowBiometricSuggestion] = useState(false);
  const [biometricRegistering, setBiometricRegistering] = useState(false);
  // Guard: prevent React 18 double-invoke (dev StrictMode) from sending two OTP codes
  const codeSentRef = useRef(false);

  const reloadWallet = async () => {
    setLoadingWallet(true);

    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes.user;
    if (!user) {
      setWallet({ balance: 0, withdraw_fee: 0 });
      setLoadingWallet(false);
      return;
    }

    const { data, error } = await supabase
      .from("wallets")
      .select("balance, withdraw_fee")
      .eq("user_id", user.id)
      .maybeSingle()
      .returns<WalletRow | null>();

    if (error || !data) {
      setWallet({ balance: 0, withdraw_fee: 0 });
      setLoadingWallet(false);
      return;
    }

    setWallet({
      balance: Number(data.balance ?? 0),
      withdraw_fee: Number(data.withdraw_fee ?? 0),
    });

    setLoadingWallet(false);
  };

  const availableBalance = wallet?.balance ?? 0;
  const totalWithdrawFees = wallet?.withdraw_fee ?? 0; // lifetime fees paid

  const [amountStr, setAmountStr] = useState("");
  const amount = useMemo(() => {
    const cleaned = amountStr.replace(/,/g, "").trim();
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  }, [amountStr]);

  const fee = useMemo(() => getWithdrawalFee(amount, "instant"), [amount]);
  const net = useMemo(() => Math.max(0, amount - fee), [amount, fee]);

  const amountTooLow = amount > 0 && amount < 1;
  const amountTooHigh = amount > availableBalance;
  const invalid = amount <= 0 || amountTooLow || amountTooHigh;

  const tierLabel = useMemo(() => {
    if (amount <= 0) return null;
    return "Instant: 5%";
  }, [amount]);

  const loadPayout = async () => {
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes.user;
    if (!user) return setPayout(null);

    const { data } = await supabase
      .from("payout_methods")
      .select("id, brand, last4, is_default")
      .eq("user_id", user.id)
      .eq("is_default", true)
      .maybeSingle();

    setPayout(data ? { id: data.id, brand: data.brand, last4: data.last4 } : null);
  };

  const loadAllMethods = async () => {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess?.session?.access_token;
    if (!token) return;
    try {
      const res = await fetch("/api/payout-methods/list", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        const methods = json.methods ?? [];
        setAllMethods(methods);
        // Auto-select the default method if none is selected yet
        if (!selectedMethodId && methods.length > 0) {
          const def = methods.find((m: PayoutMethod) => m.is_default);
          setSelectedMethodId(def ? def.id : methods[0].id);
        }
      }
    } catch {
      showGlobalToast("Failed to load payout methods");
    }
  };

  const handleRemoveMethod = async (methodId: string) => {
    setRemovingId(methodId);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) return;
      const res = await fetch("/api/payout-methods/remove", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ payout_method_id: methodId }),
      });
      if (res.ok) {
        await loadAllMethods();
        await loadPayout();
      } else {
        showGlobalToast("Failed to remove payout method");
      }
    } catch {
      showGlobalToast("Failed to remove payout method");
    } finally {
      setRemovingId(null);
    }
  };

  const handleSetDefault = async (methodId: string) => {
    setSettingDefaultId(methodId);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) return;
      const res = await fetch("/api/payout-methods/set-default", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ payout_method_id: methodId }),
      });
      if (res.ok) {
        await loadAllMethods();
        await loadPayout();
      } else {
        showGlobalToast("Failed to set default method");
      }
    } catch {
      showGlobalToast("Failed to set default method");
    } finally {
      setSettingDefaultId(null);
    }
  };

  const loadTodayEarnings = async () => {
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes.user;
    if (!user) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data } = await supabase
      .from("transactions_ledger")
      .select("amount")
      .eq("user_id", user.id)
      .eq("type", "tip_credit")
      .gte("created_at", today.toISOString());

    if (data) {
      const sum = data.reduce((acc: number, row: { amount: number }) => acc + Number(row.amount), 0);
      setTodayEarnings(sum);
    }
  };



  const loadFreezeState = async () => {
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes.user;
    if (!user) return;

    const { data } = await supabase
      .from("profiles")
      .select("is_frozen, freeze_reason, freeze_level")
      .eq("user_id", user.id)
      .maybeSingle();

    if (data) {
      // Fetch signals from the latest freeze log
      let signals: string[] = [];
      if (data.is_frozen) {
        const { data: logData } = await supabase
          .from("account_freeze_logs")
          .select("metadata")
          .eq("user_id", user.id)
          .eq("action", "freeze")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (logData?.metadata && Array.isArray((logData.metadata as Record<string, unknown>).signals)) {
          signals = (logData.metadata as Record<string, unknown>).signals as string[];
        }
      }

      setFreezeState({
        is_frozen: !!data.is_frozen,
        freeze_reason: data.freeze_reason,
        freeze_level: data.freeze_level,
        freeze_signals: signals,
      });
    }
  };

  const loadLatestWithdrawal = async () => {
    const token = await getAuthToken();
    if (!token) return;

    try {
      const res = await fetch("/api/withdrawals/latest", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;

      const json = await res.json();
      const withdrawal = json.withdrawal;
      if (!withdrawal) return;

      setReceipt({
        withdrawal_id: withdrawal.id,
        amount: Number(withdrawal.amount ?? 0),
        fee: Number(withdrawal.fee ?? 0),
        net: Number(withdrawal.net ?? 0),
        payout_status: withdrawal.status === "approved" ? "paid" : withdrawal.status ?? "pending",
        payout_method: withdrawal.payout_method ?? "instant",
        message: withdrawal.failure_reason ?? undefined,
        release_at: withdrawal.release_at ?? undefined,
        created_at: withdrawal.created_at ?? undefined,
        trust_tier: typeof withdrawal.trust_tier === "string" ? withdrawal.trust_tier : undefined,
        trust_tier_label: typeof withdrawal.trust_tier_label === "string" ? withdrawal.trust_tier_label : undefined,
        payout_delay_days: Number.isFinite(Number(withdrawal.payout_delay_days))
          ? Number(withdrawal.payout_delay_days)
          : undefined,
        instant_eligible: typeof withdrawal.instant_eligible === "boolean" ? withdrawal.instant_eligible : undefined,
        payout_policy_reason: typeof withdrawal.payout_policy_reason === "string" ? withdrawal.payout_policy_reason : undefined,
      });
    } catch {
      // Non-blocking — wallet still works without restoring the last receipt.
    }
  };

  useEffect(() => {
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes.user;
      if (user) setUserId(user.id);

      // Check if wallet 2FA is enabled
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("wallet_2fa_enabled")
          .eq("user_id", user.id)
          .maybeSingle();

        const enabled = Boolean((profile as Record<string, unknown> | null)?.wallet_2fa_enabled);
        if (enabled) {
          setWalletLocked(true);
          // Auto-send code — guarded so only one email goes out even in React 18 dev mode
          if (!codeSentRef.current) {
            codeSentRef.current = true;
            const { data: sess } = await supabase.auth.getSession();
            const token = sess?.session?.access_token;
            if (token) {
              try {
                const res = await fetch("/api/wallet/send-code", {
                  method: "POST",
                  headers: { Authorization: `Bearer ${token}` },
                });
                if (res.ok) {
                  const json = await res.json();
                  setMaskedEmail(json.maskedEmail ?? "");
                } else {
                  const json = await res.json().catch(() => null);
                  console.warn("[wallet] Auto-send code failed:", json?.error);
                }
              } catch (err) {
                console.warn("[wallet] Auto-send code error:", err);
              }
            }
          }
        } else {
          setWalletLocked(false);
        }
      } else {
        setWalletLocked(false);
      }

      reloadWallet();
      loadPayout();
      loadAllMethods();
      loadLatestWithdrawal();
      loadTodayEarnings();
      loadFreezeState();
    })();
  }, []);

  // Real-time balance refresh on new ledger entries
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`wallet-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "transactions_ledger",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const tx = payload.new as { type?: string; amount?: number };
          if (tx.amount != null) {
            setWallet((prev) => {
              if (!prev) return prev;
              const delta = Number(tx.amount);
              return { ...prev, balance: prev.balance + delta };
            });
          }
          reloadWallet();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  // Real-time withdrawal status updates (pending → completed / failed)
  useEffect(() => {
    if (!userId) return;

    const wdChannel = supabase
      .channel(`wd-status-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "withdrawals",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as { id?: string; status?: string };
          const wasCompleted = row.status === "completed";
          setReceipt((prev) => {
            if (!prev || prev.withdrawal_id !== row.id) return prev;
            return {
              ...prev,
              payout_status: wasCompleted ? "paid" : row.status ?? prev.payout_status,
            };
          });

          // Celebration when payout completes
          if (wasCompleted) {
            fireConfetti();
            showToast("Payout completed \uD83D\uDCB8", "success");
            setBalanceFlash(true);
            setTimeout(() => setBalanceFlash(false), 800);
          }

          // Refresh balance on any withdrawal status change
          reloadWallet();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(wdChannel);
    };
  }, [userId]);

  const hasCard = !!payout?.last4;



  const quickFill = (val: number) => setAmountStr(String(val));

  async function getAuthToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || null;
  }

  async function ensurePayoutsEnabled(): Promise<boolean> {
    const token = await getAuthToken();
    if (!token) {
      alert("Please log in again.");
      return false;
    }

    const res = await fetch("/api/stripe/status", {
      headers: { Authorization: `Bearer ${token}` },
    });

    const json = await res.json();
    if (!res.ok) {
      alert(json.error || "Could not check payout status.");
      return false;
    }

    if (!json.connected || !json.payoutsEnabled) {
      setShowEnableModal(true);
      return false;
    }

    return true;
  }

  const onWithdraw = async () => {
    setWithdrawError(null);
      setWithdrawErrorKind("error");
    if (amount > availableBalance) {
      setShowInsufficientModal(true);
      return;
    }

    const payoutsOk = await ensurePayoutsEnabled();
    if (!payoutsOk) return;

    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes.user;
    if (!user) {
      setWithdrawError("Session expired. Please refresh the page.");
      return;
    }

    const token = await getAuthToken();
    if (!token) {
      setWithdrawError("Session expired. Please refresh the page.");
      return;
    }

    setWithdrawing(true);

    // Resolve the destination external account ID for the selected method
    const selectedMethod = allMethods.find((m) => m.id === selectedMethodId);
    const destination = selectedMethod?.stripe_external_account_id || selectedMethod?.provider_ref || undefined;

    let res: Response;
    let json: Record<string, unknown>;
    try {
      res = await fetch("/api/withdrawals/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ amount, destination }),
      });
      json = await res.json();
    } catch {
      setWithdrawing(false);
      setWithdrawError("Network error. Please try again.");
      return;
    }

    setWithdrawing(false);

    if (!res.ok) {
      const errMsg = (json.error as string) || "Withdrawal failed. Please try again.";
      // Only show the insufficient funds modal when the user's own wallet is short.
      // Stripe-level / platform errors go to the inline error card.
      if (errMsg === "Insufficient balance") {
        setShowInsufficientModal(true);
      } else if (json.pending_cents) {
        // Funds are pending settlement — show amber notice
        setWithdrawErrorKind("pending");
        setWithdrawError(errMsg);
      } else {
        setWithdrawErrorKind("error");
        setWithdrawError(errMsg);
      }
      return;
    }

    // Fire confetti for instant payouts too
    if (json.status === "approved") {
      fireConfetti();
      showToast("Payout initiated \uD83D\uDCB8", "success");
      setBalanceFlash(true);
      setTimeout(() => setBalanceFlash(false), 800);
    }

    await reloadWallet();
    setAmountStr("");
    const newReceipt: WithdrawalReceipt = {
      withdrawal_id: json.withdrawal_id as string,
      amount: json.amount as number,
      fee: json.fee as number,
      net: json.net as number,
      payout_status: (json.status === "approved" ? "paid" : (json.status as string | undefined)) ?? "pending",
      payout_method: json.payout_method as string,
      message: json.message as string | undefined,
      release_at: json.release_at as string | undefined,
      created_at: new Date().toISOString(),
      trust_tier: json.trust_tier as string | undefined,
      trust_tier_label: json.trust_tier_label as string | undefined,
      payout_delay_days: json.payout_delay_days as number | undefined,
      instant_eligible: json.instant_eligible as boolean | undefined,
      payout_policy_reason: json.payout_policy_reason as string | undefined,
    };
    setReceipt(newReceipt);

    // Auto-dismiss after 8s only for instant payouts
    if (!json.release_at) {
      const wdId = newReceipt.withdrawal_id;
      setTimeout(() => {
        setReceipt((current) => (current?.withdrawal_id === wdId ? null : current));
      }, 8000);
    }
  };

  const [walletRevealed, setWalletRevealed] = useState(false);

  return (
    <div className={walletRevealed ? "wallet-reveal" : ""}>
      {/* Wallet 2FA lock screen */}
      {walletLocked && (
        <WalletLockScreen
          maskedEmail={maskedEmail}
          onUnlock={() => { setWalletLocked(false); setWalletRevealed(true); }}
          onSuggestBiometric={() => {
            const dismissed = Number(localStorage.getItem("bio_dismiss") || "0");
            if (dismissed < 2) setShowBiometricSuggestion(true);
          }}
        />
      )}

      {/* Biometric suggestion banner (after first OTP unlock) */}
      {showBiometricSuggestion && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-sm biometric-banner-enter">
          <div className="bg-black/90 border border-emerald-400/20 backdrop-blur-xl rounded-2xl p-4 shadow-lg shadow-emerald-500/5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0 biometric-pulse">
                <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.864 4.243A7.5 7.5 0 0119.5 10.5c0 2.92-.556 5.709-1.568 8.268M5.742 6.364A7.465 7.465 0 004.5 10.5a48.667 48.667 0 00-1.26 8.342M11.25 0v.001M7.5 10.5a4.5 4.5 0 119 0c0 3.073-.574 6.017-1.622 8.726M12 10.5a1.5 1.5 0 10-3 0c0 3.378-.622 6.616-1.757 9.6" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">Enable Face ID for faster access?</p>
                <p className="text-[11px] text-white/55">Skip the code next time</p>
              </div>
              <button
                onClick={() => {
                  const c = Number(localStorage.getItem("bio_dismiss") || "0") + 1;
                  localStorage.setItem("bio_dismiss", String(c));
                  setShowBiometricSuggestion(false);
                }}
                className="text-white/45 hover:text-white/60 transition p-1 shrink-0"
              >
                ✕
              </button>
            </div>
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => {
                  const c = Number(localStorage.getItem("bio_dismiss") || "0") + 1;
                  localStorage.setItem("bio_dismiss", String(c));
                  setShowBiometricSuggestion(false);
                }}
                className="flex-1 py-2 rounded-xl text-xs text-white/50 hover:text-white/70 transition"
              >
                Not now
              </button>
              <button
                disabled={biometricRegistering}
                onClick={async () => {
                  setBiometricRegistering(true);
                  try {
                    const { data: userRes } = await supabase.auth.getUser();
                    const user = userRes.user;
                    if (!user) return;

                    const challenge = new Uint8Array(32);
                    crypto.getRandomValues(challenge);

                    const credential = await navigator.credentials.create({
                      publicKey: {
                        challenge,
                        rp: { name: "1neLink", id: window.location.hostname },
                        user: {
                          id: new TextEncoder().encode(user.id),
                          name: user.email || "1neLink User",
                          displayName: "1neLink Wallet",
                        },
                        pubKeyCredParams: [
                          { alg: -7, type: "public-key" },
                          { alg: -257, type: "public-key" },
                        ],
                        authenticatorSelection: {
                          authenticatorAttachment: "platform",
                          userVerification: "required",
                        },
                        timeout: 60000,
                      },
                    }) as PublicKeyCredential | null;

                    if (credential) {
                      const rawId = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));
                      const response = credential.response as AuthenticatorAttestationResponse;
                      const pubKey = btoa(String.fromCharCode(...new Uint8Array(response.attestationObject)));

                      const { data: sess } = await supabase.auth.getSession();
                      const token = sess?.session?.access_token;
                      if (token) {
                        await fetch("/api/wallet/biometric", {
                          method: "POST",
                          headers: {
                            Authorization: `Bearer ${token}`,
                            "Content-Type": "application/json",
                          },
                          body: JSON.stringify({ credentialId: rawId, publicKey: pubKey }),
                        });
                      }

                      if (navigator.vibrate) navigator.vibrate([10, 50, 10]);
                      showToast("Biometric unlock enabled ✓", "success");
                    }
                  } catch {
                    // User cancelled — that's fine
                  } finally {
                    setBiometricRegistering(false);
                    setShowBiometricSuggestion(false);
                  }
                }}
                className="flex-1 py-2 rounded-xl bg-emerald-500/20 text-emerald-400 text-xs font-medium
                  hover:bg-emerald-500/30 transition active:scale-[0.97] disabled:opacity-50"
              >
                {biometricRegistering ? "Setting up…" : "Enable"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Freeze banner */}
      {freezeState?.is_frozen && (
        <div className="mb-4">
          <FreezeBanner
            freezeReason={freezeState.freeze_reason}
            freezeLevel={freezeState.freeze_level}
            freezeSignals={freezeState.freeze_signals}
            onUnfrozen={() => {
              setFreezeState({ is_frozen: false, freeze_reason: null, freeze_level: null, freeze_signals: [] });
              showToast("Account restored ✅", "success");
            }}
          />
        </div>
      )}

      {/* Stripe verification alert (if requirements detected) */}
      {!walletLocked && <StripeRequirementsCenter />}

      {/* Hero balance */}
      <div className="text-center py-8 space-y-2">
        <p className="text-sm text-white/50">Available balance</p>
        <div
          className={`transition-all duration-500 rounded-xl px-4 py-2 ${
            balanceFlash ? "bg-emerald-500/20 scale-105" : "bg-transparent scale-100"
          }`}
        >
          {loadingWallet ? (
            <div className="flex justify-center">
              <div className="h-10 w-40 shimmer rounded-lg" />
            </div>
          ) : (
            <h1 className="text-4xl font-semibold tracking-tight text-white">
              <AnimatedBalance value={availableBalance} />
            </h1>
          )}
        </div>
        {loadingWallet ? (
          <div className="flex justify-center">
            <div className="h-4 w-24 shimmer rounded" />
          </div>
        ) : (
          <p className="text-xs text-emerald-400">
          {todayEarnings > 0
            ? `+${formatMoney(todayEarnings)} today`
            : availableBalance > 0
              ? "Ready to withdraw"
              : "No funds yet"}
        </p>
        )}
        {!loadingWallet && totalWithdrawFees > 0 && (
          <p className="text-[11px] text-white/30">{formatMoney(totalWithdrawFees)} in fees paid lifetime</p>
        )}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => document.getElementById("withdraw-section")?.scrollIntoView({ behavior: "smooth" })}
          className="bg-emerald-500/20 text-emerald-400 py-3 rounded-xl font-medium hover:bg-emerald-500/30 transition"
        >
          Withdraw
        </button>
        <button
          onClick={() => setLinkOpen(true)}
          disabled={allMethods.length >= 2}
          className={`bg-white/5 border border-white/[0.12] text-white/70 py-3 rounded-xl font-medium transition ${allMethods.length >= 2 ? "opacity-40 cursor-not-allowed" : "hover:bg-white/10"}`}
        >
          {allMethods.length >= 2 ? "Card limit reached" : hasCard ? "Replace card" : "Add payout"}
        </button>
      </div>

      {/* Withdraw card */}
      <div id="withdraw-section" className={`${ui.card} mt-6 p-4 space-y-4`}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white/90">Withdraw</h2>
          <span className={`${ui.chip} bg-blue-500/10 border-blue-400/20 text-blue-200`}>
            Instant payouts
          </span>
        </div>

        {/* Payout Method Selector */}
        {allMethods.length === 0 ? (
          <div className={`${ui.cardInner} p-3 flex items-center justify-between`}>
            <div className="text-sm text-white/55">No card linked</div>
            <button type="button" onClick={() => setLinkOpen(true)} className={`${ui.btnGhost} ${ui.btnSmall}`}>Link debit card</button>
          </div>
        ) : allMethods.length === 1 ? (
          <div className={`${ui.cardInner} p-3 flex items-center justify-between`}>
            <div className="flex items-center gap-2 text-sm text-white/70">
              <span>💳</span>
              {allMethods[0].brand ? `${String(allMethods[0].brand).toUpperCase()} ` : ""}{"\u2022\u2022\u2022\u2022"} {allMethods[0].last4}
            </div>
            <span className={`${ui.chip} bg-emerald-500/10 border-emerald-400/20 text-emerald-200`}>Instant</span>
          </div>
        ) : (
          <div className={`${ui.cardInner} p-3`}>
            <label className="text-xs text-white/50 mb-2 block">Withdraw to</label>
            <div className="space-y-2">
              {allMethods.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelectedMethodId(m.id)}
                  className={`w-full flex items-center justify-between p-2.5 rounded-lg border transition ${
                    selectedMethodId === m.id
                      ? "border-emerald-400/40 bg-emerald-500/10"
                      : "border-white/[0.12] bg-white/5 hover:bg-white/10"
                  }`}
                >
                  <div className="flex items-center gap-2 text-sm text-white/80">
                    <span>💳</span>
                    <span className="uppercase">{m.brand ?? m.type ?? "Card"}</span>
                    <span>•••• {m.last4 ?? "????"}</span>
                    {m.is_default && (
                      <span className="text-xs bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full">Default</span>
                    )}
                  </div>
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                    selectedMethodId === m.id ? "border-emerald-400" : "border-white/30"
                  }`}>
                    {selectedMethodId === m.id && <div className="w-2 h-2 rounded-full bg-emerald-400" />}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Amount input */}
        <div className="flex items-center gap-2">
          <input
            className="w-full bg-transparent text-3xl font-semibold outline-none placeholder:text-white/20 text-white"
            placeholder="$0.00"
            inputMode="decimal"
            autoFocus
            value={amountStr}
            onChange={(e) => { setAmountStr(e.target.value); setWithdrawError(null); }}
          />
          <button
            type="button"
            className={`${ui.btnGhost} ${ui.btnSmall} shrink-0`}
            onClick={() => quickFill(availableBalance)}
          >
            Max
          </button>
        </div>

        {/* Quick buttons */}
        <div className="flex flex-wrap gap-2">
          {[50, 100, 250, 500].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => quickFill(v)}
              className="rounded-full bg-white/5 border border-white/[0.12] px-5 py-2.5 text-sm font-semibold text-white/75 hover:bg-white/10 active:scale-95 transition"
            >
              {formatMoney(v)}
            </button>
          ))}
        </div>

        {/* Errors */}
        {amountTooHigh && (
          <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-400/20 rounded-xl px-3 py-2">
            <span>⚠</span>
            <span>Exceeds available balance of <strong>{formatMoney(availableBalance)}</strong></span>
          </div>
        )}
        {amountTooLow && (
          <div className="text-sm text-red-300">
            Minimum withdrawal is {formatMoney(5)} (or your full balance).
          </div>
        )}

        {/* Summary */}
        <div className="p-4 rounded-xl bg-white/5 border border-white/[0.12] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-white/60">Amount</span>
            <span className="text-sm font-semibold text-white/90">{formatMoney(amount || 0)}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-white/60">
              Fee{tierLabel ? <span className="ml-1 text-xs text-white/55">({tierLabel})</span> : null}
            </span>
            <span className="text-sm font-semibold text-white/90">-{formatMoney(fee)}</span>
          </div>

          <div className="border-t border-white/[0.12] pt-3 flex items-center justify-between">
            <span className="text-sm text-white/80 font-semibold">You receive</span>
            <span className="text-xl font-semibold text-emerald-400">{formatMoney(net)}</span>
          </div>
        </div>

        {/* Withdrawal error */}
        {withdrawError && (
          withdrawErrorKind === "pending" ? (
            <div className="flex items-start gap-2.5 bg-amber-500/10 border border-amber-400/20 rounded-xl px-4 py-3">
              <span className="text-amber-400 mt-0.5 shrink-0">⏳</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-amber-300">Funds Processing</p>
                <p className="text-xs text-amber-200/70 mt-0.5">{withdrawError}</p>
              </div>
              <button onClick={() => { setWithdrawError(null); setWithdrawErrorKind("error"); }} className="text-amber-400/50 hover:text-amber-400 shrink-0 text-xs">dismiss</button>
            </div>
          ) : (
            <div className="flex items-start gap-2.5 bg-red-500/10 border border-red-400/20 rounded-xl px-4 py-3">
              <span className="text-red-400 mt-0.5 shrink-0">✕</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-red-400">Withdrawal Failed</p>
                <p className="text-xs text-red-300/70 mt-0.5">{withdrawError}</p>
              </div>
              <button onClick={() => setWithdrawError(null)} className="text-red-400/50 hover:text-red-400 shrink-0 text-xs">dismiss</button>
            </div>
          )
        )}

        {/* CTA */}
        <button
          onClick={onWithdraw}
          disabled={(invalid && !amountTooHigh) || withdrawing || !hasCard}
          className={`w-full py-3 rounded-xl font-semibold transition-all relative shimmer-btn ${
            amountTooHigh
              ? "bg-red-500/20 border border-red-400/30 text-red-400 cursor-pointer"
              : invalid || !hasCard
              ? "bg-white/10 text-white/40 cursor-not-allowed"
              : `${ui.btnPrimary}`
          }`}
        >
          {withdrawing ? (
            <span className="flex items-center justify-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
              </span>
              Processing…
            </span>
          ) : (
            `Withdraw ${formatMoney(net)}`
          )}
        </button>
        {!hasCard && (
          <p className="text-xs text-amber-400 mt-2">Link a debit card to withdraw</p>
        )}
      </div>

      {/* Withdrawal confirmation receipt */}
      {receipt && (
        <div className={`relative overflow-hidden rounded-2xl mt-6 p-5 border backdrop-blur-xl transition-all duration-300 animate-card-enter ${
          receipt.payout_status === "paid"
            ? "border-emerald-400/30 bg-emerald-500/5 animate-celebrate"
            : "border-white/[0.12] bg-white/5 hover:scale-[1.005]"
        }`}>
          {/* Ambient glow for processing state */}
          {receipt.payout_status !== "paid" && (
            <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 via-transparent to-cyan-500/10 glow-pulse pointer-events-none" />
          )}

          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-4">
              {receipt.payout_status === "paid" ? (
                <span className="text-2xl">✅</span>
              ) : (
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-400" />
                </span>
              )}
              <h2 className={`text-lg font-semibold ${
                receipt.payout_status === "paid" ? "text-emerald-400" : "text-white/90"
              }`}>
                {receipt.payout_status === "paid" ? "Withdrawal Complete" : "Withdrawal Initiated"}
              </h2>
            </div>

            {/* Arrival estimate */}
            {receipt.payout_status !== "paid" && (
              <div className="mb-4 rounded-xl bg-white/5 border border-white/[0.12] px-4 py-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-cyan-500/15 border border-cyan-400/30 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <div className="text-sm font-medium text-white/80">Arrives in 1–2 business days</div>
                  <div className="text-xs text-white/55 mt-0.5">Instant payouts arrive within minutes</div>
                </div>
              </div>
            )}

            {/* Countdown timer for pending withdrawals */}
            {receipt.release_at && receipt.payout_status !== "paid" && (
              <div className="mb-4">
                <WithdrawalTimer
                  releaseAt={receipt.release_at}
                  createdAt={receipt.created_at}
                  onReleased={() => reloadWallet()}
                />
              </div>
            )}

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/60">Amount</span>
                <span className="text-sm font-semibold text-white/90">{formatMoney(receipt.amount)}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-white/60">Fee (Instant: 5%)</span>
                <span className="text-sm font-semibold text-white/90">-{formatMoney(receipt.fee)}</span>
              </div>

              <div className="border-t border-white/[0.12] pt-3 flex items-center justify-between">
                <span className="text-sm text-white/80 font-semibold">You receive</span>
                <span className="text-lg font-semibold text-emerald-400">{formatMoney(receipt.net)}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-white/60">Status</span>
                <span className={`text-sm font-semibold flex items-center gap-1.5 ${
                  receipt.payout_status === "paid" ? "text-emerald-400" : "text-cyan-400"
                }`}>
                  {receipt.payout_status !== "paid" && (
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                  )}
                  {receipt.payout_status === "paid" ? "Paid" : receipt.message ?? "Processing"}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-white/60">Method</span>
                <span className="text-sm text-white/70 capitalize">{receipt.payout_method}</span>
              </div>

              {receipt.trust_tier_label && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-white/60">Trust tier</span>
                  <span className="text-sm font-semibold text-violet-300">{receipt.trust_tier_label}</span>
                </div>
              )}

              {typeof receipt.payout_delay_days === "number" && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-white/60">Tier delay policy</span>
                  <span className="text-sm text-white/70">
                    {receipt.payout_delay_days === 0 ? "Instant eligible" : `${receipt.payout_delay_days} day${receipt.payout_delay_days === 1 ? "" : "s"}`}
                  </span>
                </div>
              )}

              {receipt.payout_policy_reason && (
                <div className="rounded-lg bg-white/[0.04] border border-white/[0.1] px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-white/45">Payout policy</p>
                  <p className="text-xs text-white/70 mt-1">{receipt.payout_policy_reason}</p>
                </div>
              )}
            </div>

            <button
              onClick={() => setReceipt(null)}
              className={`${ui.btnGhost} w-full mt-5`}
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Payout Methods */}
      <div className={`${ui.card} mt-6 p-5`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white/90">Payout Methods</h2>
          {allMethods.length < 2 && (
            <button onClick={() => setLinkOpen(true)} className={`${ui.btnGhost} text-xs`}>
              + Add Card
            </button>
          )}
        </div>

        {allMethods.length === 0 ? (
          <p className="text-sm text-white/55">No payout methods linked yet.</p>
        ) : (
          <div className="space-y-3">
            {allMethods.map((m) => (
              <div key={m.id} className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/[0.12]">
                <div className="flex items-center gap-3">
                  <span className="text-lg">💳</span>
                  <div>
                    <span className="text-sm font-medium text-white/90 uppercase">
                      {m.brand ?? m.type ?? "Card"} •••• {m.last4 ?? "????"}
                    </span>
                    {m.is_default && (
                      <span className="ml-2 text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">
                        Default
                      </span>
                    )}
                    {m.stripe_external_account_id && (
                      <span className="ml-2 text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">
                        Stripe
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!m.is_default && (
                    <button
                      onClick={() => handleSetDefault(m.id)}
                      disabled={settingDefaultId === m.id}
                      className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50"
                    >
                      {settingDefaultId === m.id ? "Setting…" : "Set Default"}
                    </button>
                  )}
                  <button
                    onClick={() => handleRemoveMethod(m.id)}
                    disabled={removingId === m.id}
                    className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
                  >
                    {removingId === m.id ? "Removing…" : "Remove"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      <LinkDebitCardModal open={linkOpen} onClose={() => setLinkOpen(false)} onLinked={() => { loadPayout(); loadAllMethods(); }} />

      <EnablePayoutsModal
        open={showEnableModal}
        onClose={() => setShowEnableModal(false)}
        onEnable={async () => {
          router.push("/dashboard/onboarding");
        }}
        balanceText={formatMoney(availableBalance)}
      />

      {/* Insufficient Funds Modal */}
      {showInsufficientModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full sm:max-w-sm bg-[#111] rounded-t-2xl sm:rounded-2xl p-5 border border-white/10 shadow-2xl">
            <div className="flex items-center gap-2.5 mb-1">
              <span className="text-xl">⚠️</span>
              <h2 className="text-lg font-semibold text-white">Insufficient Funds</h2>
            </div>
            <p className="text-sm text-white/50 mt-1.5">
              You don&apos;t have enough balance to complete this withdrawal.
            </p>

              <div className="mt-4 bg-white/5 rounded-xl p-4 border border-white/10 space-y-2.5">
              <div className="flex justify-between text-sm">
                <span className="text-white/50">Requested</span>
                <span className="text-white font-medium">{formatMoney(amount)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-white/50">Available</span>
                <span className="text-emerald-400 font-medium">{formatMoney(availableBalance)}</span>
              </div>
              {amount > availableBalance && (
                <div className="border-t border-white/10 pt-2.5 flex justify-between text-sm">
                  <span className="text-white/50">Shortfall</span>
                  <span className="text-red-400 font-medium">{formatMoney(amount - availableBalance)}</span>
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setShowInsufficientModal(false)}
                className="flex-1 py-2.5 rounded-xl bg-white/10 text-sm text-white/70 hover:bg-white/15 transition"
              >
                Adjust Amount
              </button>
              <button
                onClick={() => {
                  setAmountStr(String(availableBalance));
                  setShowInsufficientModal(false);
                }}
                className="flex-1 py-2.5 rounded-xl bg-white text-black text-sm font-semibold hover:bg-white/90 transition"
              >
                Withdraw Max
              </button>
            </div>
          </div>
        </div>
      )}

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
