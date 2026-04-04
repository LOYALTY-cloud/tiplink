export const supportResponses = [
  {
    keywords: ["withdraw", "payout", "cash out", "cash-out", "transfer money", "get my money"],
    reply:
      "To withdraw, go to Dashboard → Wallet → Withdraw. Enter the amount, confirm, and funds will be sent to your linked bank account. Payouts typically take 1–3 business days. The minimum withdrawal is $5 and the daily limit is $1,000. New accounts must wait 24 hours before their first withdrawal.",
  },
  {
    keywords: ["same day", "withdraw today", "when can i withdraw", "how soon", "how long", "withdrawal time", "instant withdraw", "wait to withdraw"],
    reply:
      "You can withdraw tips the same day you receive them — there's no hold period on incoming tips. However, new accounts must wait 24 hours after sign-up before their first withdrawal. The minimum withdrawal is $5 and the daily limit is $1,000. Payouts to your bank take 1–3 business days after you initiate a withdrawal.",
  },
  {
    keywords: ["fee", "charge", "why was i charged", "platform fee", "how much", "cost"],
    reply:
      "We charge 2.9% + $0.30 (Stripe processing) plus a 1.1% platform fee. Fees are always shown before you confirm a transaction — no surprises.",
  },
  {
    keywords: ["refund", "money back", "reverse", "chargeback"],
    reply:
      "Refunds can be requested through our support team. If your refund is pending, it may take a few business days to process back to your payment method.",
  },
  {
    keywords: ["not received", "missing money", "didn't get", "where is my", "still processing"],
    reply:
      "Your money may still be processing. Check your wallet balance and transaction history. If it's been more than an hour, contact support for help.",
  },
  {
    keywords: ["goal", "set goal", "earning goal"],
    reply:
      "You can set an earnings goal from your Earnings page. It tracks tips received since the goal start date and shows your progress in real time.",
  },
  {
    keywords: ["tip", "send tip", "how to tip", "receive tip", "get tips"],
    reply:
      "To receive tips, share your 1neLink link. To send a tip, visit someone's profile link and enter the amount — you can pay with any card.",
  },
  {
    keywords: ["delete account", "close account", "remove account"],
    reply:
      "To delete your account, go to Dashboard → Settings → Delete Account. Make sure to withdraw any remaining balance first. This action is permanent and cannot be undone.",
  },
  {
    keywords: ["password", "reset password", "forgot password", "change password"],
    reply:
      "To reset your password, go to the login page and tap 'Forgot password?'. You'll receive a reset link via email. The link expires after 1 hour.",
  },
  {
    keywords: ["profile", "edit profile", "change name", "update profile"],
    reply:
      "Go to Dashboard → Profile → Edit to update your display name, bio, profile image, and social links. Changes are saved instantly.",
  },
  {
    keywords: ["handle", "username", "change username", "change handle"],
    reply:
      "Go to Dashboard → Profile → Edit to update your handle. Note: changing your handle will update your public 1neLink URL.",
  },
  {
    keywords: ["stripe", "connect stripe", "onboarding", "enable payouts", "activate payouts", "start receiving"],
    reply:
      "To start receiving payouts, go to Dashboard → Settings → Activate Payouts and follow the onboarding steps. You'll need to verify your identity and link a bank account.",
  },
  {
    keywords: ["bank", "connect bank", "add bank", "bank account"],
    reply:
      "To connect your bank, go to Dashboard → Settings → Activate Payouts and follow the Stripe onboarding steps. Make sure your bank information is correct.",
  },
  {
    keywords: ["notification", "alerts", "bell"],
    reply:
      "Notifications appear via the bell icon on your Dashboard. You'll get alerts for new tips, payouts, goal completions, and security events.",
  },
  {
    keywords: ["share", "my link", "share link", "qr code"],
    reply:
      "Go to Dashboard → Share to copy your unique tip link or download your QR code. Share it on social media, in your bio, or anywhere you like.",
  },
  {
    keywords: ["payment fail", "declined", "card declined", "payment error"],
    reply:
      "Payments can fail due to insufficient funds, card declined by your bank, network issues, or security blocks. Try checking your balance or using a different payment method.",
  },
  {
    keywords: ["pending", "pending payout", "still pending"],
    reply:
      "Pending means your withdrawal is still processing. Payouts typically take 1–3 business days. If it's been more than 5 days, contact support.",
  },
  {
    keywords: ["limit", "withdrawal limit", "daily limit", "max withdraw", "minimum", "minimum withdrawal"],
    reply:
      "The minimum withdrawal is $5 and you can withdraw up to $1,000 per day. There's no hold period on tips — you can withdraw the same day you receive them. New accounts must wait 24 hours after sign-up before their first withdrawal.",
  },
  {
    keywords: ["locked", "account locked", "can't login", "locked out"],
    reply:
      "Your account may be locked after multiple failed login attempts. Wait 15–30 minutes and try again, or reset your password. If you're still locked out, contact support.",
  },
  {
    keywords: ["verify", "verification", "verify account", "identity"],
    reply:
      "Go to Dashboard → Settings → Activate Payouts to start the Stripe verification process. You'll need to provide your name, address, and ID. Verification is required for payouts.",
  },
  {
    keywords: ["not working", "broken", "bug", "error", "crash"],
    reply:
      "Try refreshing the page, checking your internet connection, or clearing your browser cache. If the problem persists, contact support with details about what's happening.",
  },
  {
    keywords: ["what is", "how does it work", "getting started", "new here"],
    reply:
      "1neLink lets you create a personal tipping page. Sign up, set up your profile, share your link, and receive tips from anyone. Check our Help Center for detailed guides!",
  },
  {
    keywords: ["sign up", "create account", "register", "join"],
    reply:
      "Go to the 1neLink sign-up page, enter your email and create a password, then verify your email. You can start sharing your link right away!",
  },
  {
    keywords: ["log out", "logout", "sign out"],
    reply:
      "Look for the logout option in your Dashboard navigation or settings and tap 'Log Out'. Your data is safe and you can log back in anytime.",
  },
  {
    keywords: ["after onboarding", "receive tips after", "start receiving", "onboarding complete", "finished onboarding", "tips after setup"],
    reply:
      "Yes! Once you complete Stripe onboarding and your account is verified, you can start receiving tips immediately — there's no waiting period. Just share your 1neLink and tips will go straight to your wallet.",
  },
  {
    keywords: ["pending onboarding", "still pending", "onboarding not done", "not verified yet", "can i receive tips", "tips before onboarding", "before verified"],
    reply:
      "No — you cannot receive tips while your onboarding is still pending. Stripe needs to verify your account first. Once verification is complete and your account is approved, you'll be able to receive tips right away. Go to Dashboard → Settings → Activate Payouts to check your status or complete onboarding.",
  },
];
