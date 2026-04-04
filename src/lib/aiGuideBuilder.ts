import type { AISection } from "./aiMap"

/**
 * Build a step-by-step guide response for a matched section.
 * If the admin is already on the page, tells them what to look for.
 * Otherwise, gives navigation steps + action button.
 */
export function buildStepGuide(
  section: AISection,
  currentPage: string
): { text: string; action: { label: string; route: string } | null } {
  const isSamePage =
    currentPage === section.route ||
    currentPage.startsWith(section.route + "/")

  if (isSamePage) {
    return {
      text: `You're already on the ${section.name} page.\n\nLook for:\n• ${section.items.join("\n• ")}`,
      action: null,
    }
  }

  return {
    text: `You are currently not on the correct page.\n\nTo check this:\n1. Click "${section.navLabel}" in the top navigation\n2. Open the ${section.name} section\n\nNote: This is not shown on the current page.`,
    action: {
      label: `Go to ${section.name}`,
      route: section.route,
    },
  }
}
