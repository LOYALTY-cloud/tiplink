"use client";

import { useState } from "react";
import Link from "next/link";
import { ui } from "@/lib/ui";

type Article = { title: string; body: string };

type Category = {
  icon: string;
  label: string;
  articles: Article[];
};

const CATEGORIES: Category[] = [
  {
    icon: "💰",
    label: "Payments & Tips",
    articles: [
      {
        title: "🧾 How to receive tips",
        body: "Share your 1neLink link and users can send you money instantly.\n\nSteps:\n1. Go to your Profile\n2. Copy your personal link\n3. Share it on social media or messages\n4. When someone sends a tip, it will appear in your wallet\n\nTips are added to your wallet balance immediately. Some payments may take a few seconds to process.",
      },
      {
        title: "💸 How to send money",
        body: "You can send money using a user's link or username.\n\nSteps:\n1. Open the recipient's 1neLink link or search for their username\n2. Enter the amount you'd like to send\n3. Enter your payment details\n4. Confirm payment\n\nMake sure your payment method is valid and double-check the recipient before sending.",
      },
      {
        title: "❌ Why did my payment fail?",
        body: "Payments can fail due to insufficient funds, invalid info, or security checks.\n\nCommon reasons:\n• Not enough balance on your card\n• Card declined by your bank\n• Network or connectivity issue\n• Security block from your card issuer\n\nWhat to do:\n1. Check your card balance\n2. Try the payment again\n3. Use a different payment method\n4. Contact your bank if the issue persists",
      },
      {
        title: "⏳ Where is my money?",
        body: "Your money may still be processing or pending.\n\nPossible reasons:\n• Payment is still processing (usually completes in seconds)\n• The sender hasn't completed their payment yet\n• Temporary delay due to security review\n\nWhat to do:\n1. Check your wallet balance\n2. Wait a few minutes and refresh\n3. Check your transaction history for the status\n4. If it's been more than an hour, contact support",
      },
      {
        title: "💳 Fees explained",
        body: "Some transactions include small processing fees.\n\nBreakdown:\n• Sending a tip: 2.9% + $0.30 (Stripe processing) + 1.1% (platform fee)\n• Withdrawals: A small processing fee may apply\n• Receiving tips: No fee to receive — fees are charged to the sender\n\nFees are always shown before you confirm a transaction so there are no surprises.",
      },
      {
        title: "How do tips work?",
        body: "When someone visits your 1neLink page, they can send you a tip using their debit or credit card. The money goes through Stripe and lands in your connected account, minus processing fees (2.9% + $0.30 Stripe + 1.1% platform fee). Tips appear in your wallet balance almost immediately.",
      },
      {
        title: "Why was my tip declined?",
        body: "Tips can be declined if the card has insufficient funds, the card issuer blocked the transaction, or the card details were entered incorrectly. Ask the sender to try a different payment method or contact their bank.",
      },
    ],
  },
  {
    icon: "🏦",
    label: "Withdrawals & Payouts",
    articles: [
      {
        title: "💰 How to withdraw money",
        body: "Transfer your wallet balance to your bank account.\n\nSteps:\n1. Go to Dashboard → Wallet\n2. Tap \"Withdraw\"\n3. Enter the amount you'd like to withdraw\n4. Confirm the withdrawal\n\nFunds are sent to your linked bank account via Stripe. Processing typically takes 1–3 business days. Make sure you've completed Stripe onboarding first.",
      },
      {
        title: "🚫 Why can't I withdraw?",
        body: "You may need to complete some account setup steps before withdrawing.\n\nCommon reasons:\n• Payouts not enabled — you haven't completed Stripe onboarding\n• Bank not connected — no bank account linked to your profile\n• Account not verified — Stripe requires identity verification\n• Insufficient balance — your wallet balance is below the minimum\n\nHow to fix it:\n1. Go to Dashboard → Wallet\n2. Complete the Stripe onboarding if prompted\n3. Add or verify your bank account\n4. Try your withdrawal again",
      },
      {
        title: "⏱️ How long do payouts take?",
        body: "Most payouts take 1–3 business days to arrive in your bank account.\n\nDetails:\n• First payout may take slightly longer due to initial verification\n• Weekends and holidays may delay processing\n• Your bank may hold funds for an additional day\n• You can check payout status in Dashboard → Wallet → Transactions",
      },
      {
        title: "🏦 How to connect a bank account",
        body: "You need a connected bank account to receive payouts.\n\nSteps:\n1. Go to Dashboard → Wallet\n2. Tap \"Enable Payouts\" or \"Connect Stripe\"\n3. Follow the Stripe onboarding steps\n4. Enter your bank account details\n5. Confirm and complete verification\n\nMake sure your bank information is correct. Only supported banks and countries are allowed. You can update your bank details anytime from your Stripe dashboard.",
      },
      {
        title: "📉 Pending payouts explained",
        body: "\"Pending\" means your withdrawal is still being processed.\n\nWhat to expect:\n• Status will update automatically as it progresses\n• Funds will arrive in your bank once processing is complete\n• You can track the status in Dashboard → Wallet → Transactions\n\nIf a payout has been pending for more than 5 business days, contact support.",
      },
      {
        title: "Minimum withdrawal amount",
        body: "The minimum withdrawal amount is $1.00. A small platform fee (1.1%) applies to each withdrawal. There is no maximum withdrawal limit as long as you have sufficient balance.",
      },
    ],
  },
  {
    icon: "🔐",
    label: "Account & Security",
    articles: [
      {
        title: "🔑 How to reset your password",
        body: "Forgot your password? Here's how to get back in.\n\nSteps:\n1. Go to the Login page\n2. Tap \"Forgot password?\"\n3. Enter your email address\n4. Check your inbox for the reset link\n5. Click the link and set a new password\n\nThe reset link expires after 1 hour. If you don't see the email, check your spam folder.",
      },
      {
        title: "👤 How to update your profile",
        body: "Keep your profile up to date so tippers can find and recognize you.\n\nSteps:\n1. Go to Dashboard → Profile\n2. Tap \"Edit\"\n3. Update your display name, bio, profile image, or social links\n4. Save changes\n\nChanges are saved instantly and visible on your public 1neLink page.",
      },
      {
        title: "🔒 Account locked — what to do",
        body: "Your account may be locked for security reasons after multiple failed login attempts or suspicious activity.\n\nWhat to do:\n1. Wait 15–30 minutes and try again\n2. Reset your password using \"Forgot password?\"\n3. If you're still locked out, contact support with your email address\n\nWe lock accounts to protect you from unauthorized access.",
      },
      {
        title: "✅ How to verify your account",
        body: "Account verification helps unlock full platform features.\n\nSteps:\n1. Go to Dashboard → Wallet\n2. Start the Stripe verification process when prompted\n3. Submit the required information (name, address, ID)\n4. Wait for verification to complete (usually within minutes)\n\nVerification is required to enable payouts and withdraw funds.",
      },
      {
        title: "🔔 Manage notifications",
        body: "Control what alerts you receive.\n\nSteps:\n1. Notifications appear via the bell icon on your Dashboard\n2. You receive alerts for new tips, payouts, goal completions, and security events\n3. Email notifications are sent for important account activity\n\nYou can manage notification preferences from your Dashboard settings.",
      },
      {
        title: "How to delete your account",
        body: "Go to Dashboard → Settings → Delete Account. This will permanently remove your profile, transaction history, and wallet data. Make sure to withdraw any remaining balance first. This action cannot be undone.",
      },
    ],
  },
  {
    icon: "⚙️",
    label: "App & Settings",
    articles: [
      {
        title: "⚙️ App not working — troubleshooting",
        body: "If the app isn't working properly, try these steps:\n\n1. Refresh the page or restart the app\n2. Check your internet connection\n3. Clear your browser cache and cookies\n4. Try a different browser or device\n5. Check if there's a known outage\n\nIf the problem persists after trying these steps, contact support with details about what's happening.",
      },
      {
        title: "👤 How to change your username",
        body: "Your username (handle) is your unique identifier on 1neLink.\n\nSteps:\n1. Go to Dashboard → Profile\n2. Tap \"Edit\"\n3. Update your handle/username\n4. Save changes\n\nNote: Changing your handle will update your public 1neLink URL. Your old link will no longer work after the change.",
      },
      {
        title: "How to set up Stripe",
        body: "Go to Dashboard → Wallet. If you haven't connected Stripe yet, you'll see an onboarding button. Follow the steps to link your bank account and verify your identity. Once complete, you can receive tips and make withdrawals.",
      },
      {
        title: "🚪 How to log out",
        body: "Steps:\n1. Go to your Dashboard\n2. Look for the logout option in the navigation or settings\n3. Tap \"Log Out\"\n\nYou'll be returned to the login page. Your data is safe and you can log back in anytime.",
      },
      {
        title: "How to share your 1neLink",
        body: "Go to Dashboard → Share. Copy your unique link or download your QR code. You can share it on social media, in your bio, on your website, or anywhere you'd like to receive tips.",
      },
    ],
  },
  {
    icon: "❓",
    label: "Getting Started",
    articles: [
      {
        title: "🚀 What is 1neLink?",
        body: "1neLink is a platform that lets you create a personal tipping page, receive tips from anyone, and manage your earnings — all in one place.\n\nKey features:\n• Create a shareable tip link\n• Receive payments via card\n• Track earnings and goals\n• Withdraw to your bank account\n• All payments processed securely through Stripe",
      },
      {
        title: "🧭 How the platform works",
        body: "Here's how 1neLink works:\n\n1. Create your account — sign up with your email\n2. Set up your profile — add a display name, bio, and photo\n3. Share your link — copy your unique URL and share it anywhere\n4. Receive tips — anyone can send you money through your link\n5. Withdraw money — transfer your earnings to your bank account\n\nIt's that simple. No monthly fees, no subscriptions.",
      },
      {
        title: "🆕 How to create an account",
        body: "Getting started takes less than a minute.\n\nSteps:\n1. Go to the 1neLink sign-up page\n2. Enter your email and create a password\n3. Verify your email address\n4. Complete your profile\n\nOnce your account is created, you can start sharing your tip link right away. To receive payouts, you'll need to complete Stripe onboarding.",
      },
      {
        title: "🔗 How to share your link",
        body: "Your tip link is how people find you and send tips.\n\nSteps:\n1. Go to Dashboard → Share\n2. Copy your unique link or scan the QR code\n3. Share it on social media, in your bio, via text, or anywhere\n\nYour link format: 1nelink.me/yourhandle\n\nTip: Add it to your Instagram bio, Twitter profile, or YouTube description for maximum visibility.",
      },
      {
        title: "💡 How to start receiving tips",
        body: "Ready to receive your first tip?\n\nSteps:\n1. Complete your profile (display name, photo, bio)\n2. Share your 1neLink URL with your audience\n3. When someone visits your link, they can send a payment\n4. Tips appear in your wallet instantly\n\nTo withdraw tips to your bank, make sure you've completed Stripe onboarding in Dashboard → Wallet.",
      },
      {
        title: "Is 1neLink free to use?",
        body: "Creating a 1neLink account is completely free. There are no monthly or subscription fees. When you receive tips, standard processing fees apply: 2.9% + $0.30 (Stripe) and 1.1% (platform fee). Fees are always shown before confirming any transaction.",
      },
      {
        title: "How do I contact support?",
        body: "You have three ways to get help:\n\n1. 📖 Help Center — Browse articles for quick answers (you're here!)\n2. 💬 Chat with Support — Talk to our AI assistant or a live agent\n3. 🎫 Submit a Ticket — For complex issues that need investigation\n\nGo to Dashboard → Support to access all options.",
      },
    ],
  },
];

export default function HelpPage() {
  const [openCat, setOpenCat] = useState<number | null>(null);
  const [openArt, setOpenArt] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [feedback, setFeedback] = useState<Record<string, boolean | null>>({});

  // Flatten and filter articles by search
  const query = search.toLowerCase().trim();
  const searchResults =
    query.length >= 2
      ? CATEGORIES.flatMap((c) =>
          c.articles
            .filter(
              (a) =>
                a.title.toLowerCase().includes(query) ||
                a.body.toLowerCase().includes(query)
            )
            .map((a) => ({ ...a, category: c.label }))
        )
      : null;

  return (
    <div className="max-w-xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/support"
          className={`${ui.btnGhost} px-3 py-2 ${ui.btnSmall}`}
        >
          ←
        </Link>
        <div>
          <h1 className={ui.h2}>Help</h1>
          <p className={`text-sm ${ui.muted}`}>Browse topics &amp; find answers</p>
        </div>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search help articles..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className={ui.input}
      />

      {/* Search results */}
      {searchResults !== null ? (
        <div className="space-y-2">
          {searchResults.length === 0 ? (
            <p className={`text-sm ${ui.muted} text-center py-6`}>
              No articles found. Try different keywords or{" "}
              <Link href="/dashboard/support/chat" className="text-blue-400 underline">
                chat with support
              </Link>
              .
            </p>
          ) : (
            searchResults.map((a) => (
              <button
                key={a.title}
                onClick={() =>
                  setOpenArt(openArt === a.title ? null : a.title)
                }
                className={`${ui.card} w-full text-left px-4 py-3 transition hover:bg-white/[0.08]`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">{a.title}</p>
                    <p className={`text-xs ${ui.muted2}`}>{a.category}</p>
                  </div>
                  <span className="text-white/30">
                    {openArt === a.title ? "▾" : "›"}
                  </span>
                </div>
                {openArt === a.title && (
                  <div className="mt-3 pt-3 border-t border-white/10">
                    <p className={`text-sm ${ui.muted} leading-relaxed whitespace-pre-line`}>
                      {a.body}
                    </p>
                    <ArticleFeedback
                      id={a.title}
                      feedback={feedback}
                      setFeedback={setFeedback}
                    />
                  </div>
                )}
              </button>
            ))
          )}
        </div>
      ) : (
        /* Categories */
        <div className="space-y-2">
          {CATEGORIES.map((cat, ci) => (
            <div key={cat.label}>
              <button
                onClick={() => setOpenCat(openCat === ci ? null : ci)}
                className={`${ui.card} w-full text-left px-4 py-3 transition hover:bg-white/[0.08]`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{cat.icon}</span>
                    <span className="font-medium">{cat.label}</span>
                  </div>
                  <span className="text-white/30">
                    {openCat === ci ? "▾" : "›"}
                  </span>
                </div>
              </button>

              {openCat === ci && (
                <div className="ml-4 mt-1 space-y-1">
                  {cat.articles.map((art) => (
                    <div
                      key={art.title}
                      className={`${ui.cardInner} w-full text-left px-4 py-3 transition hover:bg-white/[0.08]`}
                    >
                      <div
                        className="flex items-center justify-between cursor-pointer"
                        role="button"
                        tabIndex={0}
                        onClick={() =>
                          setOpenArt(openArt === art.title ? null : art.title)
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setOpenArt(openArt === art.title ? null : art.title);
                          }
                        }}
                      >
                        <span className="text-sm font-medium">
                          {art.title}
                        </span>
                        <span className="text-white/30 text-xs">
                          {openArt === art.title ? "▾" : "›"}
                        </span>
                      </div>
                      {openArt === art.title && (
                        <div className="mt-3 pt-3 border-t border-white/10">
                          <p
                            className={`text-sm ${ui.muted} leading-relaxed whitespace-pre-line`}
                          >
                            {art.body}
                          </p>
                          <ArticleFeedback
                            id={art.title}
                            feedback={feedback}
                            setFeedback={setFeedback}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Bottom CTA */}
      <div className={`${ui.cardInner} px-4 py-4 text-center space-y-2`}>
        <p className={`text-sm ${ui.muted}`}>Can&apos;t find what you need?</p>
        <div className="flex gap-2 justify-center">
          <Link href="/dashboard/support/chat" className={`${ui.btnPrimary} ${ui.btnSmall} text-sm`}>
            💬 Chat with Support
          </Link>
          <Link href="/dashboard/support/tickets" className={`${ui.btnGhost} ${ui.btnSmall} text-sm`}>
            🎫 Submit Ticket
          </Link>
        </div>
      </div>
    </div>
  );
}

function ArticleFeedback({
  id,
  feedback,
  setFeedback,
}: {
  id: string;
  feedback: Record<string, boolean | null>;
  setFeedback: React.Dispatch<React.SetStateAction<Record<string, boolean | null>>>;
}) {
  const val = feedback[id];

  if (val !== undefined && val !== null) {
    return (
      <p className="mt-3 text-xs text-green-400">
        Thanks for your feedback!
      </p>
    );
  }

  return (
    <div className="mt-3 flex items-center gap-3">
      <span className={`text-xs ${ui.muted2}`}>Was this helpful?</span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setFeedback((f) => ({ ...f, [id]: true }));
        }}
        className="text-sm hover:scale-110 transition"
      >
        👍
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setFeedback((f) => ({ ...f, [id]: false }));
        }}
        className="text-sm hover:scale-110 transition"
      >
        👎
      </button>
    </div>
  );
}
