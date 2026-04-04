import { supportResponses } from "./supportResponses";

export function getSupportReply(message: string): string {
  const lower = message.toLowerCase();

  for (const item of supportResponses) {
    if (item.keywords.some((k) => lower.includes(k))) {
      return item.reply;
    }
  }

  return "I'm not sure about that yet. Try rephrasing your question, or contact support for help.";
}
