"use client";

import TipPublicClient from "@/app/[handle]/tip-public-client";

export default function DevTestTipPage() {
  const mockProfile = {
    user_id: "dev_user",
    handle: "dev",
    display_name: "Dev Creator",
    bio: "Test creator for dev payments",
    location: "Earth",
    avatar_url: null,
    links: [],
  };

  return <TipPublicClient profile={mockProfile} />;
}
