import OpenAI from "openai";

let _openai: OpenAI | null = null;
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

export type OcrResult = {
  full_name?: string;
  date_of_birth?: string;
  id_number?: string;
  error?: string;
};

/**
 * Extract identity data from an ID document image using OpenAI Vision.
 * Returns structured JSON with name, DOB, and optional ID number.
 * Falls back gracefully if extraction fails.
 */
export async function extractIdData(imageUrl: string): Promise<OcrResult> {
  try {
    const res = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            'You are an identity document data extractor. Extract the person\'s full name, date of birth, and document ID number from the provided ID image. Return ONLY valid JSON with these fields: "full_name" (string or null), "date_of_birth" (string in YYYY-MM-DD format or null), "id_number" (string or null). If a field is unreadable, set it to null.',
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract the full name, date of birth, and ID number from this identity document.",
            },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 300,
    });

    const raw = res.choices[0]?.message?.content;
    if (!raw) return { error: "Empty OCR response" };

    const parsed = JSON.parse(raw) as Record<string, unknown>;

    return {
      full_name: typeof parsed.full_name === "string" ? parsed.full_name : undefined,
      date_of_birth: typeof parsed.date_of_birth === "string" ? parsed.date_of_birth : undefined,
      id_number: typeof parsed.id_number === "string" ? parsed.id_number : undefined,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "OCR extraction failed";
    console.error("[ocr] extraction error:", msg);
    return { error: msg };
  }
}
