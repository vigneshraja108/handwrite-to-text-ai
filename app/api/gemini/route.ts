
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { log } from '@/lib/logger'; // adjust import if needed

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);

log('info', 'Transcribe module initialised');
log('info', 'LLM Initialised');

export async function POST(req: NextRequest) {
  log('info', 'POST /api/gemini route triggered');

  try {
    const formData = await req.formData();
    const image = formData.get('image') as File;

    if (!image) {
      log('warn', 'Image not provided in form data');
      return NextResponse.json({ error: 'Image is required' }, { status: 400 });
    }

    const buffer = Buffer.from(await image.arrayBuffer());
    const base64Image = buffer.toString('base64');
    log('info', 'Image successfully converted to base64');

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
    log('info', 'Gemini model (gemini-1.5-pro) loaded');

    const imagePart = {
      inlineData: {
        mimeType: image.type || 'image/jpeg',
        data: base64Image,
      },
    };

    const prompt = [
      { text: 'Convert this handwritten image to plain text' },
      imagePart,
    ];

    log('info', 'Prompt constructed, invoking Gemini...');
    const result = await model.generateContent(prompt);
    const response = result.response;

    // Safe access for usageMetadata
    const usageMetadata = response?.usageMetadata;
    if (usageMetadata) {
      const promptTokens = usageMetadata.promptTokenCount ?? 'unknown';
      const completionTokens = usageMetadata.candidatesTokenCount ?? 'unknown';
      const totalTokens = usageMetadata.totalTokenCount ?? 'unknown';

      log(
        'info',
        `Token usage - prompt: ${promptTokens}, completion: ${completionTokens}, total: ${totalTokens}`,
        ['token-usage']
      );
    } else {
      log('warn', 'Token usage info not available');
    }

    // Safe access for text response
    const text =
      response?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    log('info', `LLM response received: "${text.slice(0, 50)}..."`);

    return NextResponse.json({ text });
  } catch (error) {
    log(
      'error',
      `Gemini processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}
