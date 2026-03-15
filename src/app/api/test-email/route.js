import { getResend } from "@/lib/email/getResend";

export async function GET() {
  const resend = getResend();
  const data = await resend.emails.send({
    from: "no-reply@tiplinkme.com",
    to: "money2loyal@gmail.com",
    subject: "Test from TipLinkMe",
    html: "<p>Hello world</p>",
  });

  return Response.json(data);
}
