export const DEV_INSTANT_WITHDRAWALS_ENABLED =
  process.env.NODE_ENV === "development" &&
  process.env.NEXT_PUBLIC_DEV_INSTANT_WITHDRAWALS === "true";
