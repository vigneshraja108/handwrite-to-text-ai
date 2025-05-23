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
import { GoogleGenerativeAI } from '@google/generative-ai'; // Still need this for image processing if you extract it first
import { generateText, streamText } from 'ai'; // Import from Vercel AI SDK
import { google } from '@ai-sdk/google'; // <-- IMPORT 'google' FROM THE DEDICATED PACKAGE

// Initialize the Google Generative AI client (for image processing if needed elsewhere)
// OR, more typically, the Vercel AI SDK will handle the API key for 'google' provider
// If you only need text-to-text, you might not even need the direct GoogleGenerativeAI client here.
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!); // Keep this if you're processing image buffers directly

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Assuming 'extractedText' comes from a prior step where an image was processed
    // If you were to pass the image itself, the approach would be different with the AI SDK.
    const { chat, extractedText } = body;
    const question = chat?.[0]?.text || ''; // Assuming 'chat' is an array of messages

    if (!question || !extractedText) {
      return NextResponse.json({ error: 'Missing question or extracted text' }, { status: 400 });
    }

    // Combine the extracted text and the user's question into a single prompt
    const fullPrompt = `Here's a block of text extracted from a handwritten image:\n\n"${extractedText}"\n\nNow answer this user question about it:\n\n"${question}"`;

    // Use the Vercel AI SDK's 'generateText' or 'streamText' function
    const result = await generateText({
      model: google('gemini-1.5-pro'), // Specify the Google provider and the Gemini model
      prompt: fullPrompt,
      // You can add more options here, like maxTokens, temperature, etc.
      // temperature: 0.7,
    });

    // For non-streaming, you get the text directly
    const reply = result.text;

    // If you want streaming:
    // const result = await streamText({
    //   model: google('gemini-1.5-pro'),
    //   prompt: fullPrompt,
    // });
    // return result.toDataStream(); // or result.toTextStream() or result.toReadableStream()

    return NextResponse.json({ reply });
  } catch (error) {
    console.error('Chat API error:', error);
    // More robust error handling
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}