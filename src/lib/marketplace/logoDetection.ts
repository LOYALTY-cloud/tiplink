import OpenAI from "openai";

let _client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}

/**
 * Uses GPT-4o vision to check if an image contains recognizable brand logos
 * or copyrighted characters (Nike, Apple, Disney, etc.)
 *
 * Fails open — returns false on any API error so uploads are never blocked
 * by a transient AI failure.
 */
export async function detectLogosWithAI(imageUrl: string): Promise<boolean> {
  try {
    const client = getClient();
    const response = await client.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 10,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: imageUrl, detail: "low" },
            },
            {
              type: "text",
              text: 'Does this image contain any recognizable brand logos, trademarks, or copyrighted characters (e.g. Nike, Apple, Disney, Gucci, Supreme, Adidas, etc.)? Reply ONLY with "yes" or "no".',
            },
          ],
        },
      ],
    });
    const answer = response.choices[0]?.message?.content?.toLowerCase().trim() ?? "";
    return answer.startsWith("yes");
  } catch (err) {
    console.error("[logoDetection] AI error (failing open):", err);
    return false;
  }
}
