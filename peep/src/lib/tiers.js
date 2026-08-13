// Preview tiers (a.k.a. "rings"). Content and accounts each carry a tier.
// A viewer sees their own tier AND everything below it:
//   test  → sees Test + Stage + Production   (internal/QA)
//   stage → sees Stage + Production           (early access)
//   prod  → sees Production only              (real users, the default)
//
// This is client-side gating for a *preview* feature (not a security boundary) —
// unreleased content simply isn't shown to lower tiers.

export const TIERS = ["production", "stage", "test"];

export const TIER_LEVEL = { production: 0, stage: 1, test: 2 };
export const TIER_LABEL = { production: "Production", stage: "Stage", test: "Test" };

export function tierLevel(t) {
  return TIER_LEVEL[t] ?? 0;
}

// Can a viewer at `userTier` see an item at `itemTier`? (missing tier = production)
export function canSeeTier(itemTier, userTier) {
  return tierLevel(itemTier || "production") <= tierLevel(userTier || "production");
}

// Filter a list of rows by their `visibility_tier` for the given viewer tier.
export function filterByTier(items, userTier, key = "visibility_tier") {
  if (!Array.isArray(items)) return items;
  return items.filter(i => canSeeTier(i?.[key], userTier));
}
