// // app/api/gemini/route.ts

// import { GoogleAuth } from 'google-auth-library';
// import { NextRequest, NextResponse } from 'next/server';

// const PROJECT_ID = 'temperature-measurement-459005';
// const LOCATION = 'us-central1';
// const MODEL_ID = 'gemini-2.5-flash-preview-05-20';

// export async function POST(req: NextRequest) {
//   try {
//     const formData = await req.formData();
//     const image = formData.get('image') as File;

//     if (!image) {
//       return NextResponse.json({ error: 'Image is required' }, { status: 400 });
//     }

//     const buffer = Buffer.from(await image.arrayBuffer());
//     const base64Image = buffer.toString('base64');

//     const auth = new GoogleAuth({
//       keyFile: './service-account-file.json',
//       scopes: 'https://www.googleapis.com/auth/cloud-platform',
//     });

//     const client = await auth.getClient();
//     const accessToken = await client.getAccessToken();

//     const endpoint = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${MODEL_ID}:generateContent`;

//     const payload = {
//       contents: [
//         {
//           role: 'user',
//           parts: [
//             { text: 'Convert this handwritten image to plain text' },
//             {
//               inlineData: {
//                 mimeType: 'image/jpeg',
//                 data: base64Image,
//               },
//             },
//           ],
//         },
//       ],
//     };

//     const response = await fetch(endpoint, {
//       method: 'POST',
//       headers: {
//         Authorization: `Bearer ${accessToken.token}`,
//         'Content-Type': 'application/json',
//       },
//       body: JSON.stringify(payload),
//     });

//     const result = await response.json();
//     const text = result.candidates?.[0]?.content?.parts?.[0]?.text || 'No output from Gemini';

//     return NextResponse.json({ text });
//   } catch (error) {
//     console.error(error);
//     return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
//   }
// }


// app/api/gemini/route.ts


import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

// const client = new GoogleGenerativeAI('./service-account-file.json');
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!); // Use environment variable for API key


export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const image = formData.get('image') as File;

    if (!image) {
      return NextResponse.json({ error: 'Image is required' }, { status: 400 });
    }

    const buffer = Buffer.from(await image.arrayBuffer());
    const base64Image = buffer.toString('base64');

    // Get the generative model
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' }); // Use -vision model for image input

    // Prepare the image part for the Gemini API
    const imagePart = {
      inlineData: {
        mimeType: image.type || 'image/jpeg', // Ensure mimeType is correctly set
        data: base64Image,
      },
    };

    // Construct the prompt with text and image
    const prompt = [
      { text: 'Convert this handwritten image to plain text' },
      imagePart,
    ];

    // Generate content using the model
    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text(); // Get the text content from the response
    return NextResponse.json({ text });
  } catch (error) {
    console.error("Error processing request:", error);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}
