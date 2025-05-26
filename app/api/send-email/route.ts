import sgMail from "@sendgrid/mail";
import { NextRequest, NextResponse } from "next/server";

sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

export async function POST(req: NextRequest) {
  const { to, subject, message } = await req.json();

  try {
    await sgMail.send({
      to,
      from: "vigneshrajaprofessional@gmail.com",
      subject,
      text: message,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("SendGrid error", error);
    return NextResponse.json({ error: "Send failed" }, { status: 500 });
  }
}
