export type ThemePurchaseType = "owned" | "upgrade" | "full";

export type ThemePriceResolution = {
  price: number;
  type: ThemePurchaseType;
};

export function resolveThemePrice(params: {
  basePrice: number;
  upgradePrice: number | null;
  isOwnedLatest: boolean;
  qualifiesUpgrade: boolean;
}): ThemePriceResolution {
  const { basePrice, upgradePrice, isOwnedLatest, qualifiesUpgrade } = params;

  if (isOwnedLatest) {
    return { price: 0, type: "owned" };
  }

  if (qualifiesUpgrade && typeof upgradePrice === "number" && upgradePrice > 0) {
    return { price: upgradePrice, type: "upgrade" };
  }

  return { price: basePrice, type: "full" };
}
