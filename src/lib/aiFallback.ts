import { findSectionFromMessage } from "./aiLocator"
import { buildStepGuide } from "./aiGuideBuilder"

/**
 * Smart fallback handler when the AI fails or is unavailable.
 * Uses intent matching + step-by-step guide builder for useful responses.
 */
export function handleSmartFallback({
  message,
  currentPage,
}: {
  message: string
  currentPage: string
}): { text: string; action: { label: string; route: string } | null } {
  const section = findSectionFromMessage(message)

  if (!section) {
    return {
      text: "I'm having trouble responding right now, but try using the navigation menu to find what you're looking for.",
      action: null,
    }
  }

  const guide = buildStepGuide(section, currentPage)

  return {
    text: `I'm having trouble loading advanced assistance, but here's how to find it:\n\n${guide.text}`,
    action: guide.action,
  }
}

/** @deprecated Use handleSmartFallback instead */
export const handleAIFallback = ({
  message,
  currentPage,
}: {
  message: string
  currentPage: string
}) => handleSmartFallback({ message, currentPage })
