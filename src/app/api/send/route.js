import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function GET() {
  const data = await resend.emails.send({
    from: "no-reply@tiplinkme.com",
    to: "money2loyal@gmail.com",
    subject: "Test from TipLinkMe",
    html: "<p>Hello world</p>",
  });

  return Response.json(data);
}
