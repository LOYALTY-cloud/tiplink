import { Resend } from "resend";

export async function GET() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Missing RESEND_API_KEY" }), { status: 500 });
  }

  const resend = new Resend(apiKey);
  const data = await resend.emails.send({
    from: "no-reply@tiplinkme.com",
    to: "money2loyal@gmail.com",
    subject: "Test from TipLinkMe",
    html: "<p>Hello world</p>",
  });

  return Response.json(data);
}
