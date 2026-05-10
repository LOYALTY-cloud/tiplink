export type CreatorRiskLevel = "low" | "medium" | "high";

export type CreatorCategory = {
  name: string;
  group_name: string;
  stripe_description: string;
  risk_level: CreatorRiskLevel;
  payout_delay_days: number;
  requires_manual_review: boolean;
};

export const DEFAULT_CREATOR_CATEGORIES: CreatorCategory[] = [
  {
    name: "Music Artist",
    group_name: "Creator & Entertainment",
    stripe_description:
      "Creator receives fan support and monetization payments for music content and entertainment through the 1neLink platform.",
    risk_level: "low",
    payout_delay_days: 3,
    requires_manual_review: false,
  },
  {
    name: "DJ",
    group_name: "Creator & Entertainment",
    stripe_description:
      "Creator receives fan support and monetization payments for DJ and music entertainment services through the 1neLink platform.",
    risk_level: "low",
    payout_delay_days: 3,
    requires_manual_review: false,
  },
  {
    name: "Streamer",
    group_name: "Creator & Entertainment",
    stripe_description:
      "Creator monetizes livestream and entertainment content through fan support on the 1neLink platform.",
    risk_level: "low",
    payout_delay_days: 3,
    requires_manual_review: false,
  },
  {
    name: "Influencer",
    group_name: "Creator & Entertainment",
    stripe_description:
      "Creator receives fan support and monetization payments for social media and audience engagement through the 1neLink platform.",
    risk_level: "low",
    payout_delay_days: 3,
    requires_manual_review: false,
  },
  {
    name: "Podcaster",
    group_name: "Creator & Entertainment",
    stripe_description:
      "Creator monetizes podcast and audio entertainment content through the 1neLink platform.",
    risk_level: "low",
    payout_delay_days: 3,
    requires_manual_review: false,
  },
  {
    name: "Content Creator",
    group_name: "Creator & Entertainment",
    stripe_description:
      "Creator monetizes original digital content and audience engagement through the 1neLink platform.",
    risk_level: "low",
    payout_delay_days: 3,
    requires_manual_review: false,
  },
  {
    name: "Dancer",
    group_name: "Creator & Entertainment",
    stripe_description:
      "Creator receives fan support and monetization payments for dance and entertainment content through the 1neLink platform.",
    risk_level: "low",
    payout_delay_days: 3,
    requires_manual_review: false,
  },
  {
    name: "Comedian",
    group_name: "Creator & Entertainment",
    stripe_description:
      "Creator monetizes comedy and entertainment content through audience support on the 1neLink platform.",
    risk_level: "low",
    payout_delay_days: 3,
    requires_manual_review: false,
  },
  {
    name: "Cook/Chef",
    group_name: "Services & Hospitality",
    stripe_description:
      "Creator receives customer support and monetization payments related to food content and hospitality services through the 1neLink platform.",
    risk_level: "low",
    payout_delay_days: 3,
    requires_manual_review: false,
  },
  {
    name: "Waiter/Server",
    group_name: "Services & Hospitality",
    stripe_description:
      "Creator receives customer tips and support payments through the 1neLink platform.",
    risk_level: "low",
    payout_delay_days: 3,
    requires_manual_review: false,
  },
  {
    name: "Bartender",
    group_name: "Services & Hospitality",
    stripe_description:
      "Creator receives customer tips and audience support through the 1neLink platform.",
    risk_level: "low",
    payout_delay_days: 3,
    requires_manual_review: false,
  },
  {
    name: "Barber",
    group_name: "Services & Hospitality",
    stripe_description:
      "Creator monetizes barbering services, content, and audience support through the 1neLink platform.",
    risk_level: "low",
    payout_delay_days: 3,
    requires_manual_review: false,
  },
  {
    name: "Makeup Artist",
    group_name: "Services & Hospitality",
    stripe_description:
      "Creator monetizes beauty content, services, and audience engagement through the 1neLink platform.",
    risk_level: "low",
    payout_delay_days: 3,
    requires_manual_review: false,
  },
  {
    name: "Nail Technician",
    group_name: "Services & Hospitality",
    stripe_description:
      "Creator monetizes nail art services and audience engagement through the 1neLink platform.",
    risk_level: "low",
    payout_delay_days: 3,
    requires_manual_review: false,
  },
  {
    name: "Photographer",
    group_name: "Services & Hospitality",
    stripe_description:
      "Creator monetizes photography content and audience support through the 1neLink platform.",
    risk_level: "medium",
    payout_delay_days: 3,
    requires_manual_review: false,
  },
  {
    name: "Theme Designer",
    group_name: "Digital Creators",
    stripe_description:
      "Creator sells downloadable profile customization themes and creator assets through the 1neLink platform.",
    risk_level: "high",
    payout_delay_days: 7,
    requires_manual_review: true,
  },
  {
    name: "Graphic Designer",
    group_name: "Digital Creators",
    stripe_description:
      "Creator monetizes original graphic design content and creator assets through the 1neLink platform.",
    risk_level: "medium",
    payout_delay_days: 3,
    requires_manual_review: false,
  },
  {
    name: "Digital Artist",
    group_name: "Digital Creators",
    stripe_description:
      "Creator monetizes digital artwork and audience engagement through the 1neLink platform.",
    risk_level: "medium",
    payout_delay_days: 3,
    requires_manual_review: false,
  },
  {
    name: "UI Creator",
    group_name: "Digital Creators",
    stripe_description:
      "Creator sells digital UI customization assets and creator tools through the 1neLink platform.",
    risk_level: "high",
    payout_delay_days: 7,
    requires_manual_review: true,
  },
  {
    name: "Video Editor",
    group_name: "Digital Creators",
    stripe_description:
      "Creator monetizes video editing services and digital content through the 1neLink platform.",
    risk_level: "medium",
    payout_delay_days: 3,
    requires_manual_review: false,
  },
  {
    name: "Tutor",
    group_name: "Education & Coaching",
    stripe_description:
      "Creator monetizes educational content and tutoring support through the 1neLink platform.",
    risk_level: "low",
    payout_delay_days: 3,
    requires_manual_review: false,
  },
  {
    name: "Fitness Coach",
    group_name: "Education & Coaching",
    stripe_description:
      "Creator monetizes fitness coaching content and audience engagement through the 1neLink platform.",
    risk_level: "low",
    payout_delay_days: 3,
    requires_manual_review: false,
  },
  {
    name: "Mentor",
    group_name: "Education & Coaching",
    stripe_description:
      "Creator monetizes mentorship and educational support through the 1neLink platform.",
    risk_level: "low",
    payout_delay_days: 3,
    requires_manual_review: false,
  },
  {
    name: "Educator",
    group_name: "Education & Coaching",
    stripe_description:
      "Creator monetizes educational and instructional content through the 1neLink platform.",
    risk_level: "low",
    payout_delay_days: 3,
    requires_manual_review: false,
  },
];

const LEGACY_TO_CANONICAL: Record<string, string> = {
  creator_tips: "Content Creator",
  digital_creator_content: "Content Creator",
  profile_themes: "Theme Designer",
  graphic_assets: "Graphic Designer",
  educational_content: "Educator",
  streaming_entertainment: "Streamer",
  social_creator: "Influencer",
};

function normalize(v: string) {
  return v.trim().toLowerCase();
}

export function normalizeCreatorCategoryName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return LEGACY_TO_CANONICAL[trimmed] || trimmed;
}

export function findDefaultCreatorCategory(value: unknown): CreatorCategory | null {
  const canonical = normalizeCreatorCategoryName(value);
  if (!canonical) return null;
  const needle = normalize(canonical);
  return DEFAULT_CREATOR_CATEGORIES.find((c) => normalize(c.name) === needle) || null;
}

export function getDefaultCreatorCategory(): CreatorCategory {
  return DEFAULT_CREATOR_CATEGORIES.find((c) => c.name === "Content Creator") || DEFAULT_CREATOR_CATEGORIES[0];
}
