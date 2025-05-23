// import { NextRequest, NextResponse } from 'next/server';
// import { GoogleGenerativeAI } from '@google/generative-ai';

// const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);

// export async function POST(req: NextRequest) {
//   try {
//     const body = await req.json();

//     const { chat, extractedText } = body;
//     const question = chat?.[0]?.text || '';

//     if (!question || !extractedText) {
//       return NextResponse.json({ error: 'Missing question or extracted text' }, { status: 400 });
//     }

//     const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });

//     const prompt = [
//       { text: `Here's a block of text extracted from a handwritten image:\n\n"${extractedText}"\n\nNow answer this user question about it:\n\n"${question}"` },
//     ];

//     const result = await model.generateContent(prompt);
//     const response = result.response;
//     const reply = await response.text();

//     return NextResponse.json({ reply });
//   } catch (error) {
//     console.error('Chat API error:', error);
//     return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
//   }
// }



// or pages/api/gemini.ts (for Pages Router)

import { NextRequest, NextResponse } from 'next/server';
import { generateText } from 'ai';
import { google } from '@ai-sdk/google';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { chat, extractedText } = body;

    if (!chat?.length || !extractedText) {
      return NextResponse.json({ error: 'Missing chat history or extracted text' }, { status: 400 });
    }

    const historyText = chat
      .map((msg: any) => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.text}`)
      .join('\n');

    const prompt = `
You are a helpful assistant whose sole purpose is to answer questions **only about the extracted text from a handwritten document**.

Here is the extracted text from the image:
"""
${extractedText}
"""

Here is the conversation so far:
${historyText}

**IMPORTANT:**  
- Only answer questions that relate to the extracted text above.  
- If the user asks something unrelated to this document, politely respond that you can only answer questions about the document.  
- Do NOT make up answers or provide unrelated information.  
- If the answer is not in the extracted text, say: "I'm sorry, I don't have information about that in the document."

Continue the conversation accordingly.
`;

    const result = await generateText({
      model: google('gemini-1.5-pro'),
      prompt,
      // Optional: temperature, maxTokens, etc.
    });

    return NextResponse.json({ reply: result.text });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json({ error: (error as Error).message || 'Internal server error' }, { status: 500 });
  }
}

