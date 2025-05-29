// app/api/chat/route.ts
import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import OpenAI from "openai";
import moment from "moment";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { chat, extractedText } = body;

    if (!chat?.length || !extractedText) {
      return NextResponse.json(
        { error: "Missing chat history or extracted text" },
        { status: 400 }
      );
    }

    const lastUserMessage = chat[chat.length - 1].text;

    // --- RAG Intent Analysis ---
    console.log("Performing RAG intent analysis...");
    const intentAnalysis = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `Analyze the user's latest query.
    1. Determine if it requires searching through **past or historical extracted documents and chat sessions** (e.g., "what did I send yesterday?", "show me emails from last week", "what was extracted on May 1st?"). This *includes* requests for a summary or list of documents from the **current day** if the query implies looking beyond just the single active document (e.g., "all documents from today", "everything I sent today").
    2. If it's a time-based query, extract the specific date or date range for the historical search. Provide the start and end of the relevant period in ISO 8601 format (YYYY-MM-DDTHH:mm:ssZ).
       - If it's a single day, provide start and end for that specific day (e.g., "yesterday" -> current_date_minus_1_dayT00:00:00Z to current_date_minus_1_dayT23:59:59Z).
       - If it's a range (e.g., "last week" -> start of last Monday to end of last Sunday).
       - For "today" or "this day", provide the start and end of the current day.
    3. If the query is clearly about the *current* extracted document only (e.g., "summarize this", "explain this part of the text"), or is a general conversational query without historical implication, set needs_rag to "no" and dates as null.

    Respond in JSON format: {"needs_rag": "yes" | "no", "start_date": "YYYY-MM-DDTHH:mm:ssZ" | null, "end_date": "YYYY-MM-DDTHH:mm:ssZ" | null}`,
        },
        {
          role: "user",
          content: `Latest User Query: "${lastUserMessage}"`,
        },
      ],
      response_format: { type: "json_object" },
    });

    let parsedIntent;
    try {
      parsedIntent = JSON.parse(
        intentAnalysis.choices?.[0]?.message?.content || "{}"
      );
      console.log("Parsed Intent:", parsedIntent);
    } catch (e) {
      console.error("Failed to parse intent analysis JSON:", e);
      parsedIntent = { needs_rag: "no", start_date: null, end_date: null };
    }

    const needsRAG = parsedIntent.needs_rag?.toLowerCase() === "yes";
    let startDate = parsedIntent.start_date;
    let endDate = parsedIntent.end_date;

    // Fallback for common temporal terms if not parsed by GPT (optional but good for robustness)
    if (needsRAG && (!startDate || !endDate)) {
      const today = moment.utc();
      if (lastUserMessage.toLowerCase().includes("yesterday")) {
        startDate = moment
          .utc()
          .subtract(1, "day")
          .startOf("day")
          .toISOString();
        endDate = moment.utc().subtract(1, "day").endOf("day").toISOString();
      } else if (
        lastUserMessage.toLowerCase().includes("today") ||
        lastUserMessage.toLowerCase().includes("this day")
      ) {
        startDate = today.startOf("day").toISOString();
        endDate = today.endOf("day").toISOString();
      } else if (lastUserMessage.toLowerCase().includes("last week")) {
        startDate = moment
          .utc()
          .subtract(1, "week")
          .startOf("isoWeek")
          .toISOString();
        endDate = moment
          .utc()
          .subtract(1, "week")
          .endOf("isoWeek")
          .toISOString();
      } else if (lastUserMessage.toLowerCase().includes("this week")) {
        startDate = today.startOf("isoWeek").toISOString();
        endDate = today.endOf("isoWeek").toISOString();
      }
    }

    let finalPromptContent: string;

    if (needsRAG) {
      console.log("RAG deemed necessary. Performing Qdrant search...");
      // --- RAG Logic: Embed query, search Qdrant, build context ---
      const embeddingResponse = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: lastUserMessage,
      });
      const queryEmbedding = embeddingResponse.data[0].embedding;

      const filter: any = {
        must: [{ key: "isEmailSent", match: { value: true } }],
      };

      if (startDate && endDate) {
        filter.must.push({
          key: "timestamp",
          range: {
            gte: startDate,
            lte: endDate,
          },
        });
      }
      console.log("Qdrant filter for RAG:", JSON.stringify(filter, null, 2));

      // DEBUG: Qdrant client API key being used (should show eyJhb...)
      console.log(
        "DEBUG: Qdrant client API key used:",
        process.env.QDRANT_API_KEY?.substring(0, 5) + "..."
      );

      const { QdrantClient } = require("@qdrant/js-client-rest"); // Import here if not global
      const QDRANT_HOST =
        process.env.QDRANT_HOST ||
        "https://2d4f72f1-9a15-4508-8846-ff849f2b4637.us-east4-0.gcp.cloud.qdrant.io:6333";
      const QDRANT_API_KEY_LOCAL = process.env.QDRANT_API_KEY;

      let qdrantClientToUse;
      if (QDRANT_API_KEY_LOCAL) {
        qdrantClientToUse = new QdrantClient({
          url: QDRANT_HOST,
          apiKey: QDRANT_API_KEY_LOCAL,
        });
        console.log(
          "DEBUG: Using NEWLY INITIALIZED QdrantClient in POST. API key used:",
          QDRANT_API_KEY_LOCAL.substring(0, 5) + "..."
        );
      } else {
        console.error(
          "ERROR: QDRANT_API_KEY is not available for new client initialization!"
        );

        return NextResponse.json(
          { error: "Qdrant API Key not found for search" },
          { status: 500 }
        );
      }

      const startTime = new Date(Date.parse(startDate)); // parses ISO 8601 as UTC
      const endTime = new Date(Date.parse(endDate));

      const startMs = startTime.getTime();
      const endMs = endTime.getTime();

      const timestampFilter: any = {
        must: [
          {
            key: "timestamp",
            range: {
              gte: startMs,
              lte: endMs,
            },
          },
        ],
      };

      // Ensure the search call uses the client you've confirmed to be initialized
      const searchResults = await qdrantClientToUse.search("documents", {
        vector: queryEmbedding,
        limit: 10, // Retrieve top 5 relevant documents
        with_payload: true,
        filter: timestampFilter,
      });

      console.log("this is the search result u r looking", searchResults);

      const context = searchResults
        .map((res: any) => {
          const payload = res.payload;
          const messages = Array.isArray(payload.chatHistory)
            ? payload.chatHistory
                .map(
                  (msg: any) =>
                    `${
                      msg.role === "user" ? "User" : "Assistant"
                    }: ${msg.text.replace(/(\*\*|__)/g, "")}`
                )
                .join("\n")
            : "";
          return `--- Document Start ---\nExtracted Text: ${
            payload.extractedText
          }\nAssociated Chat History:\n${messages}\nTimestamp: ${
            payload.timestamp || "N/A"
          }\n--- Document End ---`;
        })
        .join("\n\n");

      console.log(
        "Context from Qdrant:",
        context.substring(0, 500).trim() + "..."
      );

      finalPromptContent = `You are a helpful assistant. Your goal is to answer the user's question by combining information from the current document (if relevant) and any relevant historical data provided.

      Here is the current extracted text from the image for the active session:
      """
      ${extractedText}
      """

      Here is the historical context retrieved from past interactions, based on relevance and any specified timeframes:
      """
      ${
        context.trim() ||
        "No specific historical context was found based on the query and filters."
      }
      """

      Here is the full conversation history:
      ${chat
        .map(
          (msg: any) =>
            `${msg.role === "user" ? "User" : "Assistant"}: ${msg.text}`
        )
        .join("\n")}

      **IMPORTANT INSTRUCTIONS:**
      - Answer the user's question concisely, using information from the "current extracted text" AND the "historical context" as needed.
      - If the user asks about something specific to a date or time, clearly refer to the information from that period if found in the historical context.
      - If the answer is not present in **either** the current extracted text or the provided historical context, state: "I'm sorry, I don't have enough information from the documents or historical data to answer that."
      - Do NOT invent information.
      - Pay attention to the user's latest question and its potential temporal or contextual implications.
      `;
    } else {
      console.log(
        "RAG not deemed necessary. Proceeding with direct chat on current document."
      );
      const historyText = chat
        .map(
          (msg: any) =>
            `${msg.role === "user" ? "User" : "Assistant"}: ${msg.text}`
        )
        .join("\n");

      finalPromptContent = `
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
    }

    const result = await generateText({
      model: google("gemini-1.5-pro"),
      prompt: finalPromptContent,
    });

    return NextResponse.json({ reply: result.text });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Internal server error" },
      { status: 500 }
    );
  }
}
