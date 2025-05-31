import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { qdrant } from "@/lib/qdrant";
import { log } from "@/lib/logger";  // <--- Import your shared logger

log('info', 'Transcribe module initialised');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
log('info', 'LLM Initialised');

type ChatMessage = {
  role: string;
  text: string;
  isEmailSent?: boolean;
  emailAddress?: string;
  timestamp?: string;
};

type Metadata = {
  isEmailSent?: boolean;
  emailAddress?: string;
  timestamp?: string;
};

export async function POST(req: NextRequest) {
  log('info', 'POST /api/chat/save route triggered');

  try {
    const {
      extractedText,
      chatHistory,
      metadata,
    }: {
      extractedText: string;
      chatHistory: ChatMessage[];
      metadata?: Metadata;
    } = await req.json();

    if (!extractedText || !chatHistory || !Array.isArray(chatHistory)) {
      log('warn', 'Missing or invalid input in request body');
      return NextResponse.json({ error: "Missing or invalid input" }, { status: 400 });
    }

    log('info', 'Generating embedding input from extracted text and chat history');

    const combinedText = [
      extractedText,
      ...chatHistory.map((m) => `${m.role}: ${m.text}`),
    ].join("\n");

    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: combinedText,
    });

    // Log token usage if available
    // Note: usage may be undefined, so safely access it
    const usage = (embeddingResponse as any).usage; 
    if (usage && typeof usage === 'object') {
      log('info', `Token usage - prompt tokens: ${usage.prompt_tokens ?? usage.total_tokens ?? 'N/A'}, total tokens: ${usage.total_tokens ?? 'N/A'}`);
    } else {
      log('info', 'Token usage info not available');
    }

    const vector = embeddingResponse.data[0].embedding;
    log('info', 'Embedding generated successfully');

    await qdrant.upsert("documents", {
      points: [
        {
          id: Date.now(), // Use UUID if better uniqueness is needed
          vector,
          payload: {
            extractedText,
            chatHistory,
            ...metadata,
          },
        },
      ],
    });

    log('info', 'Data saved to Qdrant successfully');
    return NextResponse.json({ status: "Saved to Qdrant" });
  } catch (err) {
    log('error', `Qdrant save failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    return NextResponse.json({ error: "Failed to save to Qdrant" }, { status: 500 });
  }
}
