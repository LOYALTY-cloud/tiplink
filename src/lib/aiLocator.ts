import { AI_MAP, type AISection } from "./aiMap"

/**
 * Match a user message to the most relevant admin section.
 * Returns the section if any keyword/item matches, or null.
 */
export function findSectionFromMessage(message: string): AISection | null {
  const text = message.toLowerCase()

  for (const key in AI_MAP) {
    const section = AI_MAP[key as keyof typeof AI_MAP]

    if (section.items.some((item) => text.includes(item))) {
      return section
    }
  }

  return null
}
