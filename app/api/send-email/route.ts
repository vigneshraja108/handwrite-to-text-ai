import { NextRequest, NextResponse } from 'next/server';
import sgMail from '@sendgrid/mail';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { log } from '@/lib/logger'; // ✅ Use shared logger

// ℹ️ Initialization
log('info', 'Transcribe module initialised');
sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
log('info', 'LLM Initialised');

// ✅ Email validation function
const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export async function POST(req: NextRequest) {
  log('info', 'POST /api/send-email route triggered');

  const { to, subject, message } = await req.json();

  if (!to || !subject || !message) {
    log('warn', 'Missing required fields in request body', ['validation']);
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  if (!isValidEmail(to)) {
    log('warn', `Invalid email format: ${to}`, ['validation']);
    return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
  }

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
    const prompt = `Please provide a short summary of the following handwritten extracted text:\n\n"${message}"`;

    log('info', 'Sending prompt to Gemini', ['llm'], { prompt });

    const result = await model.generateContent(prompt);

    const responseText = result.response.text().trim();
    const usage =
      (result.response as any)?.usageMetadata ||
      (result as any)?.usageMetadata ||
      (result.response as any)?.usage ||
      null;

    if (usage) {
      const promptTokens = usage.promptTokenCount ?? usage.prompt_tokens ?? 'N/A';
      const candidateTokens = usage.candidatesTokenCount ?? usage.completion_tokens ?? 'N/A';
      const totalTokens = usage.totalTokenCount ?? usage.total_tokens ?? 'N/A';

      log(
        'info',
        `Gemini token usage`,
        ['llm', 'usage'],
        {
          promptTokens,
          candidateTokens,
          totalTokens,
        }
      );
    } else {
      log('warn', 'Token usage info not available', ['llm', 'usage']);
    }

    log('info', 'LLM response received', ['llm'], { summary: responseText });

    const emailBody = `
Hi,

Here is the text we extracted from your handwritten image:

-------------------------
${message}
-------------------------

📝 Summary of the text:
${responseText}

Best regards,  
Your AI Assistant
`;

log('info', `Sending email to ${to}`, ['email'], {
  subject,
  extractedText: responseText, // 🧠 Add Gemini output here
});
    await sgMail.send({
      to,
      from: 'vigneshrajaprofessional@gmail.com',
      subject,
      text: emailBody,
    });

    log('info', 'Email sent successfully', ['email'], { to });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    let errorMsg = 'Unknown error';
    const extra: Record<string, any> = {};

    if (error instanceof Error) {
      errorMsg = error.message;
      extra.stack = error.stack;
    }

    if ('code' in error) {
      errorMsg += ` (Code: ${(error as any).code})`;
      extra.code = (error as any).code;
    }

    if ('response' in error && error.response?.status) {
      errorMsg += ` (Status: ${error.response.status})`;
      extra.status = error.response.status;
      extra.response = error.response.data || {};
    }

    log('error', `Send email failed: ${errorMsg}`, ['email', 'error'], extra);
    return NextResponse.json({ error: 'Send failed' }, { status: 500 });
  }
}
