// import sgMail from "@sendgrid/mail";
// import { NextRequest, NextResponse } from "next/server";

// sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

// export async function POST(req: NextRequest) {
//   const { to, subject, message } = await req.json();

//   try {
//     await sgMail.send({
//       to,
//       from: "vigneshrajaprofessional@gmail.com",
//       subject,
//       text: `Extracted Text: \n ${message}`,
//     });
//     return NextResponse.json({ success: true });
//   } catch (error) {
//     console.error("SendGrid error", error);
//     return NextResponse.json({ error: "Send failed" }, { status: 500 });
//   }
// }


import { NextRequest, NextResponse } from 'next/server';
import sgMail from '@sendgrid/mail';
import { GoogleGenerativeAI } from '@google/generative-ai';

sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);

export async function POST(req: NextRequest) {
  const { to, subject, message } = await req.json();

  if (!to || !subject || !message) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  try {
    // Use Gemini to generate summary
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
    const prompt = `Please provide a short summary of the following handwritten extracted text:\n\n"${message}"`;

    const result = await model.generateContent(prompt);
    const summary = result.response.text().trim();

const emailBody = `
Hi,

Here is the text we extracted from your handwritten image:

-------------------------
${message}
-------------------------

📝 Summary of the text:
${summary}

Best regards,  
Your AI Assistant
`;

    await sgMail.send({
      to,
      from: 'vigneshrajaprofessional@gmail.com',
      subject,
      text: emailBody,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Send email error:', error);
    return NextResponse.json({ error: 'Send failed' }, { status: 500 });
  }
}
