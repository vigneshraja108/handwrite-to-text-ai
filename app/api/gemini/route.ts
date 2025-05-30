// app/api/gemini/route.ts
// import { NextRequest, NextResponse } from 'next/server';
// import { GoogleGenerativeAI } from '@google/generative-ai';

// // const client = new GoogleGenerativeAI('./service-account-file.json');
// const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!); // Use environment variable for API key


// export async function POST(req: NextRequest) {
//   try {
//     const formData = await req.formData();
//     const image = formData.get('image') as File;

//     if (!image) {
//       return NextResponse.json({ error: 'Image is required' }, { status: 400 });
//     }

//     const buffer = Buffer.from(await image.arrayBuffer());
//     const base64Image = buffer.toString('base64');

//     // Get the generative model
//     const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' }); // Use -vision model for image input

//     // Prepare the image part for the Gemini API
//     const imagePart = {
//       inlineData: {
//         mimeType: image.type || 'image/jpeg', // Ensure mimeType is correctly set
//         data: base64Image,
//       },
//     };

//     // Construct the prompt with text and image
//     const prompt = [
//       { text: 'Convert this handwritten image to plain text' },
//       imagePart,
//     ];

//     // Generate content using the model
//     const result = await model.generateContent(prompt);
//     const response = result.response;
//     const text = response.text(); // Get the text content from the response
//     return NextResponse.json({ text });
//   } catch (error) {
//     console.error("Error processing request:", error);
//     return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
//   }
// }







// import { NextRequest, NextResponse } from 'next/server';
// import { GoogleGenerativeAI } from '@google/generative-ai';

// // 🔧 Logger
// const log = (level: 'info' | 'warn' | 'error', message: string) => {
//   const now = new Date();
//   const timestamp = now
//     .toLocaleString('en-GB', { hour12: false })
//     .replace(',', '')
//     .replace(/\//g, '-');
//   console.log(`${timestamp} [${level}] ${message}`);
// };

// // 🔄 Initialise LLM
// log('info', 'Transcribe module initialised');
// const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
// log('info', 'LLM Initialised');

// export async function POST(req: NextRequest) {
//   log('info', 'POST /api/gemini route triggered');

//   try {
//     const formData = await req.formData();
//     const image = formData.get('image') as File;

//     if (!image) {
//       log('warn', 'Image not provided in form data');
//       return NextResponse.json({ error: 'Image is required' }, { status: 400 });
//     }

//     const buffer = Buffer.from(await image.arrayBuffer());
//     const base64Image = buffer.toString('base64');
//     log('info', 'Image successfully converted to base64');

//     // Get generative model
//     const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
//     log('info', 'Gemini model (gemini-1.5-pro) loaded');

//     const imagePart = {
//       inlineData: {
//         mimeType: image.type || 'image/jpeg',
//         data: base64Image,
//       },
//     };

//     const prompt = [
//       { text: 'Convert this handwritten image to plain text' },
//       imagePart,
//     ];

//     log('info', 'Prompt constructed, invoking Gemini...');
//     const result = await model.generateContent(prompt);

//     const response = result.response;
//     const text = response.text();
//     log('info', `LLM response received: "${text.slice(0, 50)}..."`); // Logging first 50 chars

//     return NextResponse.json({ text });
//   } catch (error) {
//     log('error', `Gemini processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
//     return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
//   }
// }



import * as logfire from 'logfire';
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

logfire.configure({
  token: 'pylf_v1_eu_qXWs4vhgCDG92Dt1wRLD1xTBZ5Z4mxTqJRB56H4pnl2R',
  serviceName: 'starter-project',
  serviceVersion: '1.0.0',
});

const log = (level: 'info' | 'warn' | 'error', message: string) => {
  switch(level) {
    case 'info':
      logfire.info(message, {}, { tags: ['api', 'gemini'] });
      break;
    case 'warn':
      // If no warn method, fallback to info or console.warn
      logfire.info(`WARN: ${message}`, {}, { tags: ['api', 'gemini', 'warn'] });
      break;
    case 'error':
      logfire.error(message, {}, { tags: ['api', 'gemini'] });
      break;
  }

  console.log(`[${level.toUpperCase()}] ${message}`);
};


log('info', 'Transcribe module initialised');
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
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
    const text = response.text();
    log('info', `LLM response received: "${text.slice(0, 50)}..."`);

    return NextResponse.json({ text });
  } catch (error) {
    log('error', `Gemini processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}
