// app/api/chat/route.ts
import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import OpenAI from "openai";
import moment from "moment";
import { QdrantClient } from "@qdrant/js-client-rest";
import { log } from "@/lib/logger"; // Import your Logfire-configured logger

// ℹ️ INFO: Initialize OpenAI client
log('info', 'Initializing OpenAI client', ['startup']);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

const QDRANT_HOST =
  process.env.QDRANT_HOST ||
  "https://2d4f72f1-9a15-4508-8846-ff849f2b4637.us-east4-0.gcp.cloud.qdrant.io:6333";
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;

let qdrantClient: QdrantClient | null = null;
if (QDRANT_API_KEY) {
  log('info', 'Initializing Qdrant client', ['startup']);
  qdrantClient = new QdrantClient({
    url: QDRANT_HOST,
    apiKey: QDRANT_API_KEY,
  });
} else {
  // ❌ ERROR: Qdrant API key missing
  log('error', "QDRANT_API_KEY is not available for client initialization!", ['startup', 'config-error']);
}

// --- Tool Definition ---
const ragTool: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "search_historical_documents",
    description: "Searches historical extracted documents and chat sessions based on a query and an optional date range. Use this when the user asks for information from past interactions or documents, or requests a summary/list of documents from a specific time period (including the current day if it implies looking beyond the single active document).",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The user's query that needs to be searched in historical documents. This query should always be provided. For general 'last N' requests, use a generic term like 'document content' or 'extracted text'.",
        },
        start_date: {
          type: "string",
          format: "date-time",
          description: "The UTC start date for the historical search in ISO 8601 format (YYYY-MM-DDTHH:mm:ssZ).",
        },
        end_date: {
          type: "string",
          format: "date-time",
          description: "The UTC end date for the historical search in ISO 8601 format (YYYY-MM-DDTHH:mm:ssZ).",
        },
        limit: {
          type: "integer",
          description: "The maximum number of documents to retrieve. Defaults to a reasonable number (e.g., 5 or 100) if not specified by the user. Should be an integer greater than 0.",
        },
        // --- NEW PARAMETER ---
        sort_order: {
          type: "string",
          enum: ["asc", "desc"],
          description: "The chronological sort order: 'asc' for oldest first, 'desc' for newest first. Defaults to 'desc' if not specified.",
        },
      },
      required: ["query"], // Query is always required now
    },
  },
};

// --- Helper Function for RAG (Encapsulates Qdrant Logic) ---
async function searchHistoricalDocuments(
  query: string,
  startDate?: string,
  endDate?: string,
  limit: number = 100,
  sortOrder: "asc" | "desc" = "desc" // Add sortOrder parameter with a default
) {
  if (!qdrantClient) {
    log('error', "Qdrant client not initialized. Cannot perform historical search.", ['qdrant', 'error']);
    return "Error: Historical search service unavailable.";
  }

  const actualLimit = Math.max(1, Math.min(limit, 100)); // Cap limit to 100 to prevent huge fetches
  log('info', `Starting historical search`, ['qdrant', 'search'], { query, startDate: startDate || 'N/A', endDate: endDate || 'N/A', requestedLimit: limit, actualLimit, sortOrder });

  try {
    let searchResults: any[] = [];
    const commonFilter: any = { must: [] };

    // Define generic queries that signal a purely chronological intent
    const genericQueries = [
      "document content",
      "extracted text",
      "past interactions",
      "all documents",
      "records",
    ].map(q => q.toLowerCase().trim());


    // Determine if it's a pure chronological request (no specific date range AND a generic query)
    const isPureChronologicalRequest = !startDate && !endDate &&
      genericQueries.includes(query.toLowerCase().trim());

    if (startDate && endDate || isPureChronologicalRequest) {
      log('info', "Performing chronological/date-range search (using scroll).", ['qdrant', 'chronological-search']);
      // Scenario 1 & 2: User specified a date range OR pure chronological "last N" request.
      // For both these cases, we need to fetch all potentially relevant points and sort in memory.
      // This ensures we get the EXACT last N by timestamp, bypassing semantic similarity for "last N".

      if (startDate && endDate) {
        const startTime = new Date(startDate);
        const endTime = new Date(endDate);
        const startMs = startTime.getTime();
        const endMs = endTime.getTime();

        log('info', `Applying date filter: ${startTime.toISOString()} to ${endTime.toISOString()}`, ['qdrant', 'date-filter']);
        commonFilter.must.push({
          key: "timestamp",
          range: {
            gte: startMs,
            lte: endMs,
          },
        });
      }

      const allPointsForSorting: any[] = [];
      let offset: number | undefined = undefined;
      const batchSize = 100; // Fetch in larger batches if needed to cover "last N" or date range

      // Iterate through all points matching the filter (or all points if no filter)
      // until we have enough or run out of points.
      while (true) {
        log('info', `Scrolling Qdrant with offset: ${offset || 'start'}, batch size: ${batchSize}`, ['qdrant', 'scroll']);
        const response = await qdrantClient.scroll("documents", {
          limit: batchSize,
          offset,
          with_payload: true,
          filter: commonFilter.must.length > 0 ? commonFilter : undefined,
          // No direct sort_by here, we'll sort in memory
        });

        const { points, next_page_offset } = response;
        allPointsForSorting.push(...points);
        log('info', `Fetched ${points.length} points in current scroll batch. Total collected: ${allPointsForSorting.length}`, ['qdrant', 'scroll-batch']);

        if (!next_page_offset) {
          log('info', 'No more pages to scroll.', ['qdrant', 'scroll-end']);
          break;
        }
        offset = Number(next_page_offset);
      }

      // Sort all collected points by timestamp descending and take the limit
      searchResults = allPointsForSorting
        .filter((p) => p.payload?.timestamp)
        .sort((a, b) => {
          const timestampA = Number(a.payload!.timestamp);
          const timestampB = Number(b.payload!.timestamp);
          return sortOrder === "desc" ? timestampB - timestampA : timestampA - timestampB;
        })
        .slice(0, actualLimit);

      log('info', `Scroll (for chronological/date-range) retrieved ${allPointsForSorting.length} raw points. After in-memory sorting (${sortOrder} order) and limiting, using ${searchResults.length} points.`, ['qdrant', 'scroll-results']);

    } else {
      // Scenario 3: Semantic search with a specific user query (no date range and query is not generic).
      // This path prioritizes semantic relevance AND sorts by timestamp.
      log('info', "Performing semantic search.", ['qdrant', 'semantic-search']);
      log('info', `Requesting embedding for query`, ['openai', 'embedding'], { query });
      const embeddingResponse = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: query,
      });
      const queryEmbedding = embeddingResponse.data[0].embedding;
      log('info', "Embedding created.", ['openai', 'embedding-complete']);

      searchResults = await qdrantClient.search("documents", {
        vector: queryEmbedding,
        limit: actualLimit,
        with_payload: true,
        filter: commonFilter.must.length > 0 ? commonFilter : undefined, // Filter if commonFilter was populated somehow (unlikely in this branch unless logic changes)
        params: {
          indexed_only_payload: true,
          sort_by: {
            key: "timestamp",
            direction: sortOrder === "asc" ? "asc" : "desc", // Apply sort_order here as well
          },
        },
      });
      log('info', `Semantic search retrieved ${searchResults.length} points.`, ['qdrant', 'semantic-results']);
    }


    const context = searchResults
      .map((res: any) => {
        const payload = res.payload;
        const extractedTextContent = payload.extractedText || "No extracted text available.";

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
          extractedTextContent
        }\nAssociated Chat History:\n${messages}\nTimestamp: ${
          payload.timestamp ? new Date(payload.timestamp).toISOString() : "N/A"
        }\n--- Document End ---`;
      })
      .join("\n\n");

    if (context.trim() === "") {
        log('info', 'No historical context found for the query and filters.', ['qdrant', 'no-context']);
    } else {
        log('info', 'Historical context formatted successfully.', ['qdrant', 'context-formatted']);
    }
    return context.trim() || "No specific historical context was found based on the query and filters.";
  } catch (error) {
    // ❌ ERROR: Log specific Qdrant/embedding error
    log('error', `Error during historical document search: ${(error as Error).message}`, ['qdrant', 'error', 'search-failure']);
    return `Error retrieving historical data: ${(error as Error).message}`;
  }
}

export async function POST(req: NextRequest) {
  log('info', 'Received POST request for chat processing.', ['request']);
  try {
    // ℹ️ INFO: Parsing request body
    const body = await req.json();
    const { chat, extractedText } = body;
    log('info', 'Parsed request body (chat & extractedText present).', ['request', 'body-parsed']);

    // ⚠️ WARNING: Missing fields check
    if (!chat?.length || !extractedText) {
      log('warn', 'Missing required fields: chat history or extracted text.', ['validation', 'missing-fields']);
      return NextResponse.json(
        { error: "Missing chat history or extracted text" },
        { status: 400 }
      );
    }

    const lastUserMessage = chat[chat.length - 1].text;
    log('info', `Last user message: "${lastUserMessage.substring(0, 50)}..."`, ['chat', 'user-message']);

    // Log before OpenAI call with user message
    log('info', "Calling LLM for initial tool decision.", ['llm', 'openai', 'tool-decision'], {
        "user chat message": lastUserMessage
    });
    const initialResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are a helpful assistant. Your primary role is to answer questions. If the user's query requires searching through past documents or chat sessions (e.g., "what did I send yesterday?", "show me emails from last week", "what was extracted on May 1st?", "all documents from today", "show me the last 5 documents", "list the 3 most recent entries", "show me the last 5 records"), use the 'search_historical_documents' tool. Otherwise, prepare to answer based on the current document or engage in general conversation.

          **All date and time calculations MUST be performed in UTC.**
          Current UTC date for temporal queries is: ${moment.utc().format("YYYY-MM-DD")}.

          When extracting dates for the tool, ensure they are in ISO 8601 format (YYYY-MM-DDTHH:mm:ssZ) and represent UTC times:
          - For 'today' or 'this day', use current_utc_dateT00:00:00Z to current_utc_dateT23:59:59Z.
          - For 'yesterday', use current_utc_date_minus_1_dayT00:00:00Z to current_utc_date_minus_1_dayT23:59:59Z.
          - For 'last week', use the UTC start of last Monday to the UTC end of last Sunday (ISO week).
          - For 'this week', use the UTC start of this Monday to the UTC end of this Sunday (ISO week).
          **IMPORTANT:** The 'search_historical_documents' tool always requires a 'query' parameter.
          - If the user explicitly provides a search query (e.g., "what about the standard service?", "search for 'welcome' entries"), use that as the 'query'.
          - If the user asks for a specific number of documents chronologically (e.g., "show me the last 5 documents", "list the 3 most recent entries", "show me the last 5 records"), and **does not provide a specific content query**, use a generic but descriptive query like "document content", "extracted text", "past interactions", or "records" for the 'query' parameter.
          This specific generic query will signal to the backend to perform a purely chronological search.
          - If the user asks for a specific number of documents (e.g., "last 5", "top 3", "most recent 10"), set the 'limit' parameter in the tool call accordingly.
          If no number is specified but a historical search is needed (e.g., "what did I do yesterday?"), use a default limit of 10.
          - **When the user asks for the "first N" or "oldest N" documents, set 'sort_order' to 'asc'.
          Otherwise, if the user asks for "last N" or "most recent N" documents, set 'sort_order' to 'desc'.
          If not specified, default 'sort_order' to 'desc'.**
          `,
        },
        {
          role: "user",
          content: `Latest User Query: "${lastUserMessage}"`,
        },
      ],
      tools: [ragTool],
      tool_choice: "auto",
    });

    const responseMessage = initialResponse.choices[0].message;
    let assistantResponseText: string | null = null;

    if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
      log('info', "LLM decided to call a tool.", ['llm', 'tool-call']);
      const toolCall = responseMessage.tool_calls[0];

      // Log after OpenAI initial response
      log('info', `LLM response for initial tool decision.`, ['llm', 'openai', 'token-usage'], {
          model: 'gpt-4o',
          promptTokens: initialResponse.usage?.prompt_tokens,
          completionTokens: initialResponse.usage?.completion_tokens,
          "AI reply message": responseMessage.content || JSON.stringify(responseMessage.tool_calls) // Capture tool call info if no direct content
      });


      if (toolCall.function.name === "search_historical_documents") {
        const { query, start_date, end_date, limit, sort_order } = JSON.parse(toolCall.function.arguments);
        log('info', `Executing 'search_historical_documents'`, ['tool-call', 'search-historical-documents'], {
            query,
            startDate: start_date || 'N/A',
            endDate: end_date || 'N/A',
            limit: limit || 'default',
            sortOrder: sort_order || 'default'
        });

        const toolOutput = await searchHistoricalDocuments(query, start_date, end_date, limit, sort_order);
        log('info', `Historical search completed. Output length: ${toolOutput.length}`, ['tool-call', 'search-historical-documents-complete']);


        // Log before final OpenAI call with user message
        log('info', "Calling LLM for final response after tool call.", ['llm', 'openai', 'final-response'], {
            "user chat message": lastUserMessage
        });
        const finalResponseAfterTool = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content: `You are a helpful assistant. Your goal is to answer the user's question by combining information from the current document (if relevant) and any relevant historical data provided.

              Here is the current extracted text from the image for the active session:
              """
              ${extractedText}
              """

              Here is the full conversation history:
              ${chat
                .map(
                  (msg: any) =>
                    `${msg.role === "user" ? "User" : "Assistant"}: ${msg.text}`
                )
                .join("\n")}

              **Historical Context (from tool call):**
              """
              ${toolOutput}
              """

              **IMPORTANT INSTRUCTIONS:**
              - Answer the user's question concisely, using information from the "current extracted text" AND the "historical context" as needed.
              - When presenting historical documents, list them clearly, stating their extracted text and associated timestamp.
              - All timestamps should be presented in ISO 8601 UTC format.
              - If the answer is not present in **either** the current extracted text or the provided historical context, state: "I'm sorry, I don't have enough information from the documents or historical data to answer that."
              - Do NOT invent information.
              - Pay attention to the user's latest question and its potential temporal or contextual implications.
              `,
            },
            {
              role: "user",
              content: lastUserMessage,
            },
            responseMessage,
            {
                tool_call_id: toolCall.id,
                role: "tool",
                content: toolOutput,
            }
          ],
        });

        assistantResponseText = finalResponseAfterTool.choices[0].message.content;
        // Log after OpenAI final response
        log('info', `LLM response for final answer after tool call.`, ['llm', 'openai', 'token-usage'], {
            model: 'gpt-4o',
            promptTokens: finalResponseAfterTool.usage?.prompt_tokens,
            completionTokens: finalResponseAfterTool.usage?.completion_tokens,
            "AI reply message": assistantResponseText
        });
        log('info', "Final assistant response generated.", ['llm', 'openai', 'response-generated']);

      } else {
        // ⚠️ WARNING: Unexpected tool call
        log('warn', `Unexpected tool called: ${toolCall.function.name}`, ['tool-call', 'unexpected']);
        assistantResponseText = "An unexpected tool was called. Please try again.";
      }

    } else {
      // Log before Gemini call with user message
      log('info', "LLM called: Gemini 1.5 Pro (Direct Response - no tool needed)", ['llm', 'gemini', 'direct-response'], {
          "user chat message": lastUserMessage
      });
      const historyText = chat
        .map(
          (msg: any) =>
            `${msg.role === "user" ? "User" : "Assistant"}: ${msg.text}`
        )
        .join("\n");

      const finalPromptContent = `
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
        model: google("gemini-1.5-pro"),
        prompt: finalPromptContent,
      });
      assistantResponseText = result.text;
      // Log after Gemini response
      log('info', `LLM response for direct answer.`, ['llm', 'gemini', 'token-usage'], {
          model: 'gemini-1.5-pro',
          promptTokens: result.usage?.promptTokens,
          completionTokens: result.usage?.completionTokens,
          "AI reply message": assistantResponseText
      });
      log('info', `Direct assistant response generated.`, ['llm', 'gemini', 'response-generated']);
    }

    if (assistantResponseText === null) {
      // ❌ ERROR: No response generated
      log('error', "Could not generate a response, assistantResponseText is null.", ['response', 'generation-error']);
        return NextResponse.json(
            { error: "Could not generate a response." },
            { status: 500 }
        );
    }

    log('info', "Sending final response to client.", ['response', 'success']);
    return NextResponse.json({ reply: assistantResponseText });
  } catch (error) {
    // ❌ ERROR: Catch-all for API route errors
    if ((error as any).name === 'AbortError') {
        log('error', `Chat API error: Request timed out or aborted.`, ['api-error', 'network-error', 'timeout']);
        return NextResponse.json(
            { error: "Request timed out or was aborted." },
            { status: 504 } // Gateway Timeout
        );
    } else if ((error as any).response) { // Axios or similar HTTP client error
        const status = (error as any).response.status;
        const data = (error as any).response.data;
        if (status >= 500) {
            log('error', `Chat API error: Server error from external service.`, ['api-error', 'server-error'], { status, message: data.message || 'Unknown server error' });
        } else if (status >= 400) {
            log('warn', `Chat API error: Client error from external service.`, ['api-error', 'client-error'], { status, message: data.message || 'Unknown client error' });
        }
        return NextResponse.json(
            { error: data.message || "An external service error occurred." },
            { status: status }
        );
    } else if (error instanceof Error) {
        log('error', `General chat API error: ${error.message}`, ['api-error', 'unknown-error']);
    } else {
        log('error', `General chat API error: Unknown error occurred.`, ['api-error', 'unknown-error']);
    }
    return NextResponse.json(
      { error: (error as Error).message || "Internal server error" },
      { status: 500 }
    );
  }
}