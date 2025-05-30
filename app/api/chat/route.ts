// // app/api/chat/route.ts
// import { NextRequest, NextResponse } from "next/server";
// import { generateText } from "ai";
// import { google } from "@ai-sdk/google";
// import OpenAI from "openai";
// import moment from "moment";
// import { QdrantClient } from "@qdrant/js-client-rest";

// const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// const QDRANT_HOST =
//   process.env.QDRANT_HOST ||
//   "https://2d4f72f1-9a15-4508-8846-ff849f2b4637.us-east4-0.gcp.cloud.qdrant.io:6333";
// const QDRANT_API_KEY = process.env.QDRANT_API_KEY;

// let qdrantClient: QdrantClient | null = null;
// if (QDRANT_API_KEY) {
//   qdrantClient = new QdrantClient({
//     url: QDRANT_HOST,
//     apiKey: QDRANT_API_KEY,
//   });
// } else {
//   console.error("ERROR: QDRANT_API_KEY is not available for client initialization!");
// }

// // --- Tool Definition ---
// const ragTool: OpenAI.Chat.Completions.ChatCompletionTool = {
//   type: "function",
//   function: {
//     name: "search_historical_documents",
//     description: "Searches historical extracted documents and chat sessions based on a query and an optional date range. Use this when the user asks for information from past interactions or documents, or requests a summary/list of documents from a specific time period (including the current day if it implies looking beyond the single active document).",
//     parameters: {
//       type: "object",
//       properties: {
//         query: {
//           type: "string",
//           description: "The user's query that needs to be searched in historical documents. This query should always be provided. For general 'last N' requests, use a generic term like 'document content' or 'extracted text'.",
//         },
//         start_date: {
//           type: "string",
//           format: "date-time",
//           description: "The UTC start date for the historical search in ISO 8601 format (YYYY-MM-DDTHH:mm:ssZ).",
//         },
//         end_date: {
//           type: "string",
//           format: "date-time",
//           description: "The UTC end date for the historical search in ISO 8601 format (YYYY-MM-DDTHH:mm:ssZ).",
//         },
//         limit: {
//           type: "integer",
//           description: "The maximum number of documents to retrieve. Defaults to a reasonable number (e.g., 5 or 100) if not specified by the user. Should be an integer greater than 0.",
//         },
//         // --- NEW PARAMETER ---
//         sort_order: {
//           type: "string",
//           enum: ["asc", "desc"],
//           description: "The chronological sort order: 'asc' for oldest first, 'desc' for newest first. Defaults to 'desc' if not specified.",
//         },
//       },
//       required: ["query"], // Query is always required now
//     },
//   },
// };

// // --- Helper Function for RAG (Encapsulates Qdrant Logic) ---
// async function searchHistoricalDocuments(
//   query: string,
//   startDate?: string,
//   endDate?: string,
//   limit: number = 100,
//   sortOrder: "asc" | "desc" = "desc" // Add sortOrder parameter with a default
// ) {
//   if (!qdrantClient) {
//     console.error("Qdrant client not initialized. Cannot perform historical search.");
//     return "Error: Historical search service unavailable.";
//   }

//   const actualLimit = Math.max(1, Math.min(limit, 100)); // Cap limit to 100 to prevent huge fetches

//   try {
//     let searchResults: any[] = [];
//     const commonFilter: any = { must: [] };

//     // Define generic queries that signal a purely chronological intent
//     const genericQueries = [
//       "document content",
//       "extracted text",
//       "past interactions",
//       "all documents",
//       "records",
//     ].map(q => q.toLowerCase().trim());


//     // Determine if it's a pure chronological request (no specific date range AND a generic query)
//     const isPureChronologicalRequest = !startDate && !endDate &&
//                                      genericQueries.includes(query.toLowerCase().trim());


//     if (startDate && endDate || isPureChronologicalRequest) {
//       // Scenario 1 & 2: User specified a date range OR pure chronological "last N" request.
//       // For both these cases, we need to fetch all potentially relevant points and sort in memory.
//       // This ensures we get the EXACT last N by timestamp, bypassing semantic similarity for "last N".

//       if (startDate && endDate) {
//         const startTime = new Date(startDate);
//         const endTime = new Date(endDate);
//         const startMs = startTime.getTime();
//         const endMs = endTime.getTime();

//         commonFilter.must.push({
//           key: "timestamp",
//           range: {
//             gte: startMs,
//             lte: endMs,
//           },
//         });
//       }

//       const allPointsForSorting: any[] = [];
//       let offset: number | undefined = undefined;
//       const batchSize = 100; // Fetch in larger batches if needed to cover "last N" or date range

//       // Iterate through all points matching the filter (or all points if no filter)
//       // until we have enough or run out of points.
//       while (true) {
//         const response = await qdrantClient.scroll("documents", {
//           limit: batchSize,
//           offset,
//           with_payload: true,
//           filter: commonFilter.must.length > 0 ? commonFilter : undefined,
//           // No direct sort_by here, we'll sort in memory
//         });

//         const { points, next_page_offset } = response;
//         allPointsForSorting.push(...points);

//         if (!next_page_offset) break;
//         offset = Number(next_page_offset);
//       }

//       // Sort all collected points by timestamp descending and take the limit
//       searchResults = allPointsForSorting
//         .filter((p) => p.payload?.timestamp)
//         .sort((a, b) => {
//             const timestampA = Number(a.payload!.timestamp);
//             const timestampB = Number(b.payload!.timestamp);
//             return sortOrder === "desc" ? timestampB - timestampA : timestampA - timestampB;
//         })
//         .slice(0, actualLimit);

//       console.info(`Scroll (for chronological/date-range) retrieved ${allPointsForSorting.length} points.`);
//       console.info(`After in-memory sorting (${sortOrder} order) and limiting, using ${searchResults.length} points.`);

//     } else {
//       // Scenario 3: Semantic search with a specific user query (no date range and query is not generic).
//       // This path prioritizes semantic relevance AND sorts by timestamp.
//       console.info("Performing semantic search with query:", query);
//       const embeddingResponse = await openai.embeddings.create({
//         model: "text-embedding-3-small",
//         input: query,
//       });
//       const queryEmbedding = embeddingResponse.data[0].embedding;

//       searchResults = await qdrantClient.search("documents", {
//         vector: queryEmbedding,
//         limit: actualLimit,
//         with_payload: true,
//         filter: commonFilter.must.length > 0 ? commonFilter : undefined, // Filter if commonFilter was populated somehow (unlikely in this branch unless logic changes)
//         params: {
//           indexed_only_payload: true,
//           sort_by: {
//             key: "timestamp",
//             direction: sortOrder === "asc" ? "asc" : "desc", // Apply sort_order here as well
//           },
//         },
//       });
//       console.info(`Semantic search retrieved ${searchResults.length} points.`);
//     }


//     const context = searchResults
//       .map((res: any) => {
//         const payload = res.payload;
//         const extractedTextContent = payload.extractedText || "No extracted text available.";

//         const messages = Array.isArray(payload.chatHistory)
//           ? payload.chatHistory
//               .map(
//                 (msg: any) =>
//                   `${
//                     msg.role === "user" ? "User" : "Assistant"
//                   }: ${msg.text.replace(/(\*\*|__)/g, "")}`
//               )
//               .join("\n")
//           : "";
//         return `--- Document Start ---\nExtracted Text: ${
//           extractedTextContent
//         }\nAssociated Chat History:\n${messages}\nTimestamp: ${
//           payload.timestamp ? new Date(payload.timestamp).toISOString() : "N/A"
//         }\n--- Document End ---`;
//       })
//       .join("\n\n");

//     return context.trim() || "No specific historical context was found based on the query and filters.";
//   } catch (error) {
//     console.error("Error during historical document search:", error);
//     return `Error retrieving historical data: ${(error as Error).message}`;
//   }
// }

// export async function POST(req: NextRequest) {
//   try {
//     const body = await req.json();
//     const { chat, extractedText } = body;

//     if (!chat?.length || !extractedText) {
//       return NextResponse.json(
//         { error: "Missing chat history or extracted text" },
//         { status: 400 }
//       );
//     }

//     const lastUserMessage = chat[chat.length - 1].text;

//     console.info("LLM called: (Initial Tool Decision)"); // More descriptive log
//     const initialResponse = await openai.chat.completions.create({
//       model: "gpt-4o",
//       messages: [
//         {
//           role: "system",
//           content: `You are a helpful assistant. Your primary role is to answer questions. If the user's query requires searching through past documents or chat sessions (e.g., "what did I send yesterday?", "show me emails from last week", "what was extracted on May 1st?", "all documents from today", "show me the last 5 documents", "list the 3 most recent entries", "show me the last 5 records"), use the 'search_historical_documents' tool. Otherwise, prepare to answer based on the current document or engage in general conversation.

//           **All date and time calculations MUST be performed in UTC.**
//           Current UTC date for temporal queries is: ${moment.utc().format("YYYY-MM-DD")}.

//           When extracting dates for the tool, ensure they are in ISO 8601 format (YYYY-MM-DDTHH:mm:ssZ) and represent UTC times:
//           - For 'today' or 'this day', use current_utc_dateT00:00:00Z to current_utc_dateT23:59:59Z.
//           - For 'yesterday', use current_utc_date_minus_1_dayT00:00:00Z to current_utc_date_minus_1_dayT23:59:59Z.
//           - For 'last week', use the UTC start of last Monday to the UTC end of last Sunday (ISO week).
//           - For 'this week', use the UTC start of this Monday to the UTC end of this Sunday (ISO week).

//           **IMPORTANT:** The 'search_historical_documents' tool always requires a 'query' parameter.
//           - If the user explicitly provides a search query (e.g., "what about the standard service?", "search for 'welcome' entries"), use that as the 'query'.
//           - If the user asks for a specific number of documents chronologically (e.g., "show me the last 5 documents", "list the 3 most recent entries", "show me the last 5 records"), and **does not provide a specific content query**, use a generic but descriptive query like "document content", "extracted text", "past interactions", or "records" for the 'query' parameter. This specific generic query will signal to the backend to perform a purely chronological search.
//           - If the user asks for a specific number of documents (e.g., "last 5", "top 3", "most recent 10"), set the 'limit' parameter in the tool call accordingly. If no number is specified but a historical search is needed (e.g., "what did I do yesterday?"), use a default limit of 10.
//           - **When the user asks for the "first N" or "oldest N" documents, set 'sort_order' to 'asc'. Otherwise, if the user asks for "last N" or "most recent N" documents, set 'sort_order' to 'desc'. If not specified, default 'sort_order' to 'desc'.**
//           `,
//         },
//         {
//           role: "user",
//           content: `Latest User Query: "${lastUserMessage}"`,
//         },
//       ],
//       tools: [ragTool],
//       tool_choice: "auto",
//     });

//     // Log request tokens after the call
//     console.info(`OpenAI token request "Time: ${moment.utc().toISOString()} token: ${initialResponse.usage?.prompt_tokens}"`);

//     const responseMessage = initialResponse.choices[0].message;
//     let assistantResponseText: string | null = null;

//     if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
//       console.info("LLM decided to call a tool.");
//       const toolCall = responseMessage.tool_calls[0];

//       if (toolCall.function.name === "search_historical_documents") {
//         const { query, start_date, end_date, limit, sort_order } = JSON.parse(toolCall.function.arguments);
//         console.info(`Calling search_historical_documents with query: "${query}", start: "${start_date}", end: "${end_date}", limit: "${limit}", sort_order: "${sort_order}"`);

//         const toolOutput = await searchHistoricalDocuments(query, start_date, end_date, limit, sort_order);

//         console.info("LLM called: OpenAI (After Tool Call)"); // More descriptive log
//         const finalResponseAfterTool = await openai.chat.completions.create({
//           model: "gpt-4o",
//           messages: [
//             {
//               role: "system",
//               content: `You are a helpful assistant. Your goal is to answer the user's question by combining information from the current document (if relevant) and any relevant historical data provided.

//               Here is the current extracted text from the image for the active session:
//               """
//               ${extractedText}
//               """

//               Here is the full conversation history:
//               ${chat
//                 .map(
//                   (msg: any) =>
//                     `${msg.role === "user" ? "User" : "Assistant"}: ${msg.text}`
//                 )
//                 .join("\n")}

//               **Historical Context (from tool call):**
//               """
//               ${toolOutput}
//               """

//               **IMPORTANT INSTRUCTIONS:**
//               - Answer the user's question concisely, using information from the "current extracted text" AND the "historical context" as needed.
//               - When presenting historical documents, list them clearly, stating their extracted text and associated timestamp.
//               - All timestamps should be presented in ISO 8601 UTC format.
//               - If the answer is not present in **either** the current extracted text or the provided historical context, state: "I'm sorry, I don't have enough information from the documents or historical data to answer that."
//               - Do NOT invent information.
//               - Pay attention to the user's latest question and its potential temporal or contextual implications.
//               `,
//             },
//             {
//               role: "user",
//               content: lastUserMessage,
//             },
//             responseMessage,
//             {
//                 tool_call_id: toolCall.id,
//                 role: "tool",
//                 content: toolOutput,
//             }
//           ],
//         });
//         // Log request and response tokens for the second OpenAI call
//         console.info(`OpenAI token request "Time: ${moment.utc().toISOString()} token: ${finalResponseAfterTool.usage?.prompt_tokens}"`);
//         assistantResponseText = finalResponseAfterTool.choices[0].message.content;
//         console.info(`OpenAI token response "Time: ${moment.utc().toISOString()} token: ${finalResponseAfterTool.usage?.completion_tokens}"`);

//       } else {
//         assistantResponseText = "An unexpected tool was called. Please try again.";
//       }

//     } else {
//       console.info("LLM called: Gemini 1.5 Pro (Direct Response)"); // More descriptive log
//       const historyText = chat
//         .map(
//           (msg: any) =>
//             `${msg.role === "user" ? "User" : "Assistant"}: ${msg.text}`
//         )
//         .join("\n");

//       const finalPromptContent = `
// You are a helpful assistant whose sole purpose is to answer questions **only about the extracted text from a handwritten document**.

// Here is the extracted text from the image:
// """
// ${extractedText}
// """

// Here is the conversation so far:
// ${historyText}

// **IMPORTANT:**
// - Only answer questions that relate to the extracted text above.
// - If the user asks something unrelated to this document, politely respond that you can only answer questions about the document.
// - Do NOT make up answers or provide unrelated information.
// - If the answer is not in the extracted text, say: "I'm sorry, I don't have information about that in the document."

// Continue the conversation accordingly.
// `;
//       const result = await generateText({
//         model: google("gemini-1.5-pro"),
//         prompt: finalPromptContent,
//       });
//       assistantResponseText = result.text;
//       // Log request and response tokens for the Gemini API call
//       console.info(`Gemini token request "Time: ${moment.utc().toISOString()} token: ${result.usage?.promptTokens}"`);
//       console.info(`Gemini token response "Time: ${moment.utc().toISOString()} token: ${result.usage?.completionTokens}"`);
//     }

//     if (assistantResponseText === null) {
//         return NextResponse.json(
//             { error: "Could not generate a response." },
//             { status: 500 }
//         );
//     }

//     return NextResponse.json({ reply: assistantResponseText });
//   } catch (error) {
//     console.error("Chat API error:", error); // Keep as error for main API errors
//     return NextResponse.json(
//       { error: (error as Error).message || "Internal server error" },
//       { status: 500 }
//     );
//   }
// }

// app/api/chat/route.ts
// import { NextRequest, NextResponse } from "next/server";
// import { generateText } from "ai";
// import { google } from "@ai-sdk/google";
// import OpenAI from "openai";
// import moment from "moment";
// import { QdrantClient } from "@qdrant/js-client-rest";

// // ℹ️ INFO: Initialize OpenAI client
// console.info('[Init] Initializing OpenAI client');
// const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// const QDRANT_HOST =
//   process.env.QDRANT_HOST ||
//   "https://2d4f72f1-9a15-4508-8846-ff849f2b4637.us-east4-0.gcp.cloud.qdrant.io:6333";
// const QDRANT_API_KEY = process.env.QDRANT_API_KEY;

// let qdrantClient: QdrantClient | null = null;
// if (QDRANT_API_KEY) {
//   console.info('[Init] Initializing Qdrant client');
//   qdrantClient = new QdrantClient({
//     url: QDRANT_HOST,
//     apiKey: QDRANT_API_KEY,
//   });
// } else {
//   // ❌ ERROR: Qdrant API key missing
//   console.error("[Init][ERROR] QDRANT_API_KEY is not available for client initialization!");
// }

// // --- Tool Definition ---
// const ragTool: OpenAI.Chat.Completions.ChatCompletionTool = {
//   type: "function",
//   function: {
//     name: "search_historical_documents",
//     description: "Searches historical extracted documents and chat sessions based on a query and an optional date range. Use this when the user asks for information from past interactions or documents, or requests a summary/list of documents from a specific time period (including the current day if it implies looking beyond the single active document).",
//     parameters: {
//       type: "object",
//       properties: {
//         query: {
//           type: "string",
//           description: "The user's query that needs to be searched in historical documents. This query should always be provided. For general 'last N' requests, use a generic term like 'document content' or 'extracted text'.",
//         },
//         start_date: {
//           type: "string",
//           format: "date-time",
//           description: "The UTC start date for the historical search in ISO 8601 format (YYYY-MM-DDTHH:mm:ssZ).",
//         },
//         end_date: {
//           type: "string",
//           format: "date-time",
//           description: "The UTC end date for the historical search in ISO 8601 format (YYYY-MM-DDTHH:mm:ssZ).",
//         },
//         limit: {
//           type: "integer",
//           description: "The maximum number of documents to retrieve. Defaults to a reasonable number (e.g., 5 or 100) if not specified by the user. Should be an integer greater than 0.",
//         },
//         // --- NEW PARAMETER ---
//         sort_order: {
//           type: "string",
//           enum: ["asc", "desc"],
//           description: "The chronological sort order: 'asc' for oldest first, 'desc' for newest first. Defaults to 'desc' if not specified.",
//         },
//       },
//       required: ["query"], // Query is always required now
//     },
//   },
// };

// // --- Helper Function for RAG (Encapsulates Qdrant Logic) ---
// async function searchHistoricalDocuments(
//   query: string,
//   startDate?: string,
//   endDate?: string,
//   limit: number = 100,
//   sortOrder: "asc" | "desc" = "desc" // Add sortOrder parameter with a default
// ) {
//   if (!qdrantClient) {
//     console.error("[Qdrant][ERROR] Qdrant client not initialized. Cannot perform historical search.");
//     return "Error: Historical search service unavailable.";
//   }

//   const actualLimit = Math.max(1, Math.min(limit, 100)); // Cap limit to 100 to prevent huge fetches
//   console.info(`[Qdrant] Starting historical search with query: "${query}", start: "${startDate || 'N/A'}", end: "${endDate || 'N/A'}", requested limit: ${limit}, actual limit: ${actualLimit}, sort order: ${sortOrder}`);

//   try {
//     let searchResults: any[] = [];
//     const commonFilter: any = { must: [] };

//     // Define generic queries that signal a purely chronological intent
//     const genericQueries = [
//       "document content",
//       "extracted text",
//       "past interactions",
//       "all documents",
//       "records",
//     ].map(q => q.toLowerCase().trim());


//     // Determine if it's a pure chronological request (no specific date range AND a generic query)
//     const isPureChronologicalRequest = !startDate && !endDate &&
//                                      genericQueries.includes(query.toLowerCase().trim());

//     if (startDate && endDate || isPureChronologicalRequest) {
//       console.info("[Qdrant] Performing chronological/date-range search (using scroll).");
//       // Scenario 1 & 2: User specified a date range OR pure chronological "last N" request.
//       // For both these cases, we need to fetch all potentially relevant points and sort in memory.
//       // This ensures we get the EXACT last N by timestamp, bypassing semantic similarity for "last N".

//       if (startDate && endDate) {
//         const startTime = new Date(startDate);
//         const endTime = new Date(endDate);
//         const startMs = startTime.getTime();
//         const endMs = endTime.getTime();

//         console.info(`[Qdrant] Applying date filter: ${startTime.toISOString()} to ${endTime.toISOString()}`);
//         commonFilter.must.push({
//           key: "timestamp",
//           range: {
//             gte: startMs,
//             lte: endMs,
//           },
//         });
//       }

//       const allPointsForSorting: any[] = [];
//       let offset: number | undefined = undefined;
//       const batchSize = 100; // Fetch in larger batches if needed to cover "last N" or date range

//       // Iterate through all points matching the filter (or all points if no filter)
//       // until we have enough or run out of points.
//       while (true) {
//         console.info(`[Qdrant] Scrolling with offset: ${offset || 'start'}, batch size: ${batchSize}`);
//         const response = await qdrantClient.scroll("documents", {
//           limit: batchSize,
//           offset,
//           with_payload: true,
//           filter: commonFilter.must.length > 0 ? commonFilter : undefined,
//           // No direct sort_by here, we'll sort in memory
//         });

//         const { points, next_page_offset } = response;
//         allPointsForSorting.push(...points);
//         console.info(`[Qdrant] Fetched ${points.length} points in current scroll batch. Total collected: ${allPointsForSorting.length}`);

//         if (!next_page_offset) {
//           console.info('[Qdrant] No more pages to scroll.');
//           break;
//         }
//         offset = Number(next_page_offset);
//       }

//       // Sort all collected points by timestamp descending and take the limit
//       searchResults = allPointsForSorting
//         .filter((p) => p.payload?.timestamp)
//         .sort((a, b) => {
//             const timestampA = Number(a.payload!.timestamp);
//             const timestampB = Number(b.payload!.timestamp);
//             return sortOrder === "desc" ? timestampB - timestampA : timestampA - timestampB;
//         })
//         .slice(0, actualLimit);

//       console.info(`[Qdrant] Scroll (for chronological/date-range) retrieved ${allPointsForSorting.length} raw points.`);
//       console.info(`[Qdrant] After in-memory sorting (${sortOrder} order) and limiting, using ${searchResults.length} points.`);

//     } else {
//       // Scenario 3: Semantic search with a specific user query (no date range and query is not generic).
//       // This path prioritizes semantic relevance AND sorts by timestamp.
//       console.info("[Qdrant] Performing semantic search.");
//       console.info("[OpenAI] Requesting embedding for query:", query);
//       const embeddingResponse = await openai.embeddings.create({
//         model: "text-embedding-3-small",
//         input: query,
//       });
//       const queryEmbedding = embeddingResponse.data[0].embedding;
//       console.info("[OpenAI] Embedding created.");

//       searchResults = await qdrantClient.search("documents", {
//         vector: queryEmbedding,
//         limit: actualLimit,
//         with_payload: true,
//         filter: commonFilter.must.length > 0 ? commonFilter : undefined, // Filter if commonFilter was populated somehow (unlikely in this branch unless logic changes)
//         params: {
//           indexed_only_payload: true,
//           sort_by: {
//             key: "timestamp",
//             direction: sortOrder === "asc" ? "asc" : "desc", // Apply sort_order here as well
//           },
//         },
//       });
//       console.info(`[Qdrant] Semantic search retrieved ${searchResults.length} points.`);
//     }

//     const context = searchResults
//       .map((res: any) => {
//         const payload = res.payload;
//         const extractedTextContent = payload.extractedText || "No extracted text available.";

//         const messages = Array.isArray(payload.chatHistory)
//           ? payload.chatHistory
//               .map(
//                 (msg: any) =>
//                   `${
//                     msg.role === "user" ? "User" : "Assistant"
//                   }: ${msg.text.replace(/(\*\*|__)/g, "")}`
//               )
//               .join("\n")
//           : "";
//         return `--- Document Start ---\nExtracted Text: ${
//           extractedTextContent
//         }\nAssociated Chat History:\n${messages}\nTimestamp: ${
//           payload.timestamp ? new Date(payload.timestamp).toISOString() : "N/A"
//         }\n--- Document End ---`;
//       })
//       .join("\n\n");

//     if (context.trim() === "") {
//         console.info('[Qdrant] No historical context found for the query and filters.');
//     } else {
//         console.info('[Qdrant] Historical context formatted successfully.');
//     }
//     return context.trim() || "No specific historical context was found based on the query and filters.";
//   } catch (error) {
//     // ❌ ERROR: Log specific Qdrant/embedding error
//     console.error("[Qdrant][ERROR] Error during historical document search:", error);
//     return `Error retrieving historical data: ${(error as Error).message}`;
//   }
// }

// export async function POST(req: NextRequest) {
//   console.info('[Request] Received POST request for chat processing.');
//   try {
//     // ℹ️ INFO: Parsing request body
//     const body = await req.json();
//     const { chat, extractedText } = body;
//     console.info('[Request] Parsed request body (chat & extractedText present).');

//     // ⚠️ WARNING: Missing fields check
//     if (!chat?.length || !extractedText) {
//       console.warn('[Validation] Missing required fields: chat history or extracted text.');
//       return NextResponse.json(
//         { error: "Missing chat history or extracted text" },
//         { status: 400 }
//       );
//     }

//     const lastUserMessage = chat[chat.length - 1].text;
//     console.info(`[Chat] Last user message: "${lastUserMessage.substring(0, 50)}..."`); // Log snippet

//     console.info("[OpenAI] Calling OpenAI (Initial Tool Decision model: gpt-4o)");
//     const initialResponse = await openai.chat.completions.create({
//       model: "gpt-4o",
//       messages: [
//         {
//           role: "system",
//           content: `You are a helpful assistant. Your primary role is to answer questions. If the user's query requires searching through past documents or chat sessions (e.g., "what did I send yesterday?", "show me emails from last week", "what was extracted on May 1st?", "all documents from today", "show me the last 5 documents", "list the 3 most recent entries", "show me the last 5 records"), use the 'search_historical_documents' tool. Otherwise, prepare to answer based on the current document or engage in general conversation.

//           **All date and time calculations MUST be performed in UTC.**
//           Current UTC date for temporal queries is: ${moment.utc().format("YYYY-MM-DD")}.

//           When extracting dates for the tool, ensure they are in ISO 8601 format (YYYY-MM-DDTHH:mm:ssZ) and represent UTC times:
//           - For 'today' or 'this day', use current_utc_dateT00:00:00Z to current_utc_dateT23:59:59Z.
//           - For 'yesterday', use current_utc_date_minus_1_dayT00:00:00Z to current_utc_date_minus_1_dayT23:59:59Z.
//           - For 'last week', use the UTC start of last Monday to the UTC end of last Sunday (ISO week).
//           - For 'this week', use the UTC start of this Monday to the UTC end of this Sunday (ISO week).

//           **IMPORTANT:** The 'search_historical_documents' tool always requires a 'query' parameter.
//           - If the user explicitly provides a search query (e.g., "what about the standard service?", "search for 'welcome' entries"), use that as the 'query'.
//           - If the user asks for a specific number of documents chronologically (e.g., "show me the last 5 documents", "list the 3 most recent entries", "show me the last 5 records"), and **does not provide a specific content query**, use a generic but descriptive query like "document content", "extracted text", "past interactions", or "records" for the 'query' parameter. This specific generic query will signal to the backend to perform a purely chronological search.
//           - If the user asks for a specific number of documents (e.g., "last 5", "top 3", "most recent 10"), set the 'limit' parameter in the tool call accordingly. If no number is specified but a historical search is needed (e.g., "what did I do yesterday?"), use a default limit of 10.
//           - **When the user asks for the "first N" or "oldest N" documents, set 'sort_order' to 'asc'. Otherwise, if the user asks for "last N" or "most recent N" documents, set 'sort_order' to 'desc'. If not specified, default 'sort_order' to 'desc'.**
//           `,
//         },
//         {
//           role: "user",
//           content: `Latest User Query: "${lastUserMessage}"`,
//         },
//       ],
//       tools: [ragTool],
//       tool_choice: "auto",
//     });

//     // ℹ️ INFO: Log OpenAI initial request tokens
//     console.info(`[OpenAI] Initial request (gpt-4o) tokens used - Prompt: ${initialResponse.usage?.prompt_tokens}, Completion: ${initialResponse.usage?.completion_tokens}`);

//     const responseMessage = initialResponse.choices[0].message;
//     let assistantResponseText: string | null = null;

//     if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
//       console.info("[OpenAI] LLM decided to call a tool.");
//       const toolCall = responseMessage.tool_calls[0];

//       if (toolCall.function.name === "search_historical_documents") {
//         const { query, start_date, end_date, limit, sort_order } = JSON.parse(toolCall.function.arguments);
//         console.info(`[Tool Call] Executing 'search_historical_documents' with args: Query: "${query}", Start: "${start_date || 'N/A'}", End: "${end_date || 'N/A'}", Limit: "${limit || 'default'}", Sort Order: "${sort_order || 'default'}"`);

//         const toolOutput = await searchHistoricalDocuments(query, start_date, end_date, limit, sort_order);
//         console.info('[Tool Call] Historical search completed. Output length:', toolOutput.length);


//         console.info("[OpenAI] Calling OpenAI (Final Response After Tool Call model: gpt-4o)");
//         const finalResponseAfterTool = await openai.chat.completions.create({
//           model: "gpt-4o",
//           messages: [
//             {
//               role: "system",
//               content: `You are a helpful assistant. Your goal is to answer the user's question by combining information from the current document (if relevant) and any relevant historical data provided.

//               Here is the current extracted text from the image for the active session:
//               """
//               ${extractedText}
//               """

//               Here is the full conversation history:
//               ${chat
//                 .map(
//                   (msg: any) =>
//                     `${msg.role === "user" ? "User" : "Assistant"}: ${msg.text}`
//                 )
//                 .join("\n")}

//               **Historical Context (from tool call):**
//               """
//               ${toolOutput}
//               """

//               **IMPORTANT INSTRUCTIONS:**
//               - Answer the user's question concisely, using information from the "current extracted text" AND the "historical context" as needed.
//               - When presenting historical documents, list them clearly, stating their extracted text and associated timestamp.
//               - All timestamps should be presented in ISO 8601 UTC format.
//               - If the answer is not present in **either** the current extracted text or the provided historical context, state: "I'm sorry, I don't have enough information from the documents or historical data to answer that."
//               - Do NOT invent information.
//               - Pay attention to the user's latest question and its potential temporal or contextual implications.
//               `,
//             },
//             {
//               role: "user",
//               content: lastUserMessage,
//             },
//             responseMessage,
//             {
//                 tool_call_id: toolCall.id,
//                 role: "tool",
//                 content: toolOutput,
//             }
//           ],
//         });
//         // ℹ️ INFO: Log OpenAI final request tokens
//         console.info(`OpenAI token request "Time: ${moment.utc().toISOString()} token: ${finalResponseAfterTool.usage?.prompt_tokens}"`);
//         assistantResponseText = finalResponseAfterTool.choices[0].message.content;
//         console.info(`OpenAI token response "Time: ${moment.utc().toISOString()} token: ${finalResponseAfterTool.usage?.completion_tokens}"`);

//       } else {
//         // ⚠️ WARNING: Unexpected tool call
//         console.warn(`[Tool Call] Unexpected tool called: ${toolCall.function.name}`);
//         assistantResponseText = "An unexpected tool was called. Please try again.";
//       }

//     } else {
//       console.info("[Gemini] LLM called: Gemini 1.5 Pro (Direct Response - no tool needed)");
//       const historyText = chat
//         .map(
//           (msg: any) =>
//             `${msg.role === "user" ? "User" : "Assistant"}: ${msg.text}`
//         )
//         .join("\n");

//       const finalPromptContent = `
// You are a helpful assistant whose sole purpose is to answer questions **only about the extracted text from a handwritten document**.

// Here is the extracted text from the image:
// """
// ${extractedText}
// """

// Here is the conversation so far:
// ${historyText}

// **IMPORTANT:**
// - Only answer questions that relate to the extracted text above.
// - If the user asks something unrelated to this document, politely respond that you can only answer questions about the document.
// - Do NOT make up answers or provide unrelated information.
// - If the answer is not in the extracted text, say: "I'm sorry, I don't have information about that in the document."

// Continue the conversation accordingly.
// `;
//       const result = await generateText({
//         model: google("gemini-1.5-pro"),
//         prompt: finalPromptContent,
//       });
//       assistantResponseText = result.text;
//       // ℹ️ INFO: Log Gemini tokens
//        console.info(`Gemini token request "Time: ${moment.utc().toISOString()} token: ${result.usage?.promptTokens}"`);
//       console.info(`Gemini token response "Time: ${moment.utc().toISOString()} token: ${result.usage?.completionTokens}"`);
//     }

//     if (assistantResponseText === null) {
//       // ❌ ERROR: No response generated
//       console.error("[Response] Could not generate a response, assistantResponseText is null.");
//         return NextResponse.json(
//             { error: "Could not generate a response." },
//             { status: 500 }
//         );
//     }

//     console.info("[Response] Sending final response to client.");
//     return NextResponse.json({ reply: assistantResponseText });
//   } catch (error) {
//     // ❌ ERROR: Catch-all for API route errors
//     console.error("[Chat API][ERROR] General chat API error:", error);
//     return NextResponse.json(
//       { error: (error as Error).message || "Internal server error" },
//       { status: 500 }
//     );
//   }
// }













// app/api/chat/route.ts
import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import OpenAI from "openai"; // [cite: 2]
import moment from "moment"; // [cite: 2]
import { QdrantClient } from "@qdrant/js-client-rest"; // [cite: 2]

// Helper function to format logs
const log = (level: 'info' | 'warn' | 'error', message: string) => {
  const timestamp = moment.utc().format("YYYY-MM-DD HH:mm:ss");
  console[level](`${timestamp} [${level}] ${message}`);
};

// ℹ️ INFO: Initialize OpenAI client
log('info', '[Init] Initializing OpenAI client'); // [cite: 3]
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! }); // [cite: 3]

const QDRANT_HOST = // [cite: 4]
  process.env.QDRANT_HOST || // [cite: 4]
  "https://2d4f72f1-9a15-4508-8846-ff849f2b4637.us-east4-0.gcp.cloud.qdrant.io:6333"; // [cite: 4]
const QDRANT_API_KEY = process.env.QDRANT_API_KEY; // [cite: 4]

let qdrantClient: QdrantClient | null = null; // [cite: 4]
if (QDRANT_API_KEY) { // [cite: 5]
  log('info', '[Init] Initializing Qdrant client'); // [cite: 5]
  qdrantClient = new QdrantClient({ // [cite: 5]
    url: QDRANT_HOST, // [cite: 5]
    apiKey: QDRANT_API_KEY, // [cite: 5]
  }); // [cite: 5]
} else { // [cite: 6]
  // ❌ ERROR: Qdrant API key missing
  log('error', "[Init][ERROR] QDRANT_API_KEY is not available for client initialization!"); // [cite: 6]
}

// --- Tool Definition ---
const ragTool: OpenAI.Chat.Completions.ChatCompletionTool = { // [cite: 7]
  type: "function", // [cite: 7]
  function: { // [cite: 7]
    name: "search_historical_documents", // [cite: 7]
    description: "Searches historical extracted documents and chat sessions based on a query and an optional date range. Use this when the user asks for information from past interactions or documents, or requests a summary/list of documents from a specific time period (including the current day if it implies looking beyond the single active document).", // [cite: 7]
    parameters: { // [cite: 7]
      type: "object", // [cite: 7]
      properties: { // [cite: 7]
        query: { // [cite: 8]
          type: "string", // [cite: 8]
          description: "The user's query that needs to be searched in historical documents. This query should always be provided. For general 'last N' requests, use a generic term like 'document content' or 'extracted text'.", // [cite: 8]
        }, // [cite: 8]
        start_date: { // [cite: 8]
          type: "string", // [cite: 8]
          format: "date-time", // [cite: 8]
          description: "The UTC start date for the historical search in ISO 8601 format (YYYY-MM-DDTHH:mm:ssZ).", // [cite: 9]
        }, // [cite: 9]
        end_date: { // [cite: 9]
          type: "string", // [cite: 9]
          format: "date-time", // [cite: 9]
          description: "The UTC end date for the historical search in ISO 8601 format (YYYY-MM-DDTHH:mm:ssZ).", // [cite: 9]
        }, // [cite: 9]
        limit: { // [cite: 9]
          type: "integer", // [cite: 10]
          description: "The maximum number of documents to retrieve. Defaults to a reasonable number (e.g., 5 or 100) if not specified by the user. Should be an integer greater than 0.", // [cite: 10, 11, 12]
        }, // [cite: 12]
        // --- NEW PARAMETER ---
        sort_order: { // [cite: 12]
          type: "string", // [cite: 12]
          enum: ["asc", "desc"], // [cite: 12]
          description: "The chronological sort order: 'asc' for oldest first, 'desc' for newest first. Defaults to 'desc' if not specified.", // [cite: 12, 13]
        }, // [cite: 13]
      }, // [cite: 13]
      required: ["query"], // Query is always required now // [cite: 13]
    }, // [cite: 13]
  }, // [cite: 13]
}; // [cite: 13]

// --- Helper Function for RAG (Encapsulates Qdrant Logic) ---
async function searchHistoricalDocuments(
  query: string,
  startDate?: string,
  endDate?: string,
  limit: number = 100,
  sortOrder: "asc" | "desc" = "desc" // Add sortOrder parameter with a default
) {
  if (!qdrantClient) {
    log('error', "Qdrant client not initialized. Cannot perform historical search."); // [cite: 14]
    return "Error: Historical search service unavailable."; // [cite: 14]
  }

  const actualLimit = Math.max(1, Math.min(limit, 100)); // Cap limit to 100 to prevent huge fetches
  log('info', `[Qdrant] Starting historical search with query: "${query}", start: "${startDate || 'N/A'}", end: "${endDate || 'N/A'}", requested limit: ${limit}, actual limit: ${actualLimit}, sort order: ${sortOrder}`); // [cite: 14]

  try {
    let searchResults: any[] = []; // [cite: 14]
    const commonFilter: any = { must: [] }; // [cite: 14]

    // Define generic queries that signal a purely chronological intent
    const genericQueries = [ // [cite: 15]
      "document content", // [cite: 15]
      "extracted text", // [cite: 15]
      "past interactions", // [cite: 15]
      "all documents", // [cite: 15]
      "records", // [cite: 15]
    ].map(q => q.toLowerCase().trim()); // [cite: 15]


    // Determine if it's a pure chronological request (no specific date range AND a generic query)
    const isPureChronologicalRequest = !startDate && !endDate && // [cite: 16]
                                     genericQueries.includes(query.toLowerCase().trim()); // [cite: 16]

    if (startDate && endDate || isPureChronologicalRequest) { // [cite: 17]
      log('info', "[Qdrant] Performing chronological/date-range search (using scroll)."); // [cite: 17]
      // Scenario 1 & 2: User specified a date range OR pure chronological "last N" request. // [cite: 18]
      // For both these cases, we need to fetch all potentially relevant points and sort in memory. // [cite: 19]
      // This ensures we get the EXACT last N by timestamp, bypassing semantic similarity for "last N". // [cite: 20]

      if (startDate && endDate) { // [cite: 21]
        const startTime = new Date(startDate); // [cite: 21]
        const endTime = new Date(endDate); // [cite: 22]
        const startMs = startTime.getTime(); // [cite: 22]
        const endMs = endTime.getTime(); // [cite: 22]

        log('info', `[Qdrant] Applying date filter: ${startTime.toISOString()} to ${endTime.toISOString()}`); // [cite: 22]
        commonFilter.must.push({ // [cite: 23]
          key: "timestamp", // [cite: 23]
          range: { // [cite: 23]
            gte: startMs, // [cite: 23]
            lte: endMs, // [cite: 23]
          }, // [cite: 23]
        }); // [cite: 23]
      } // [cite: 24]

      const allPointsForSorting: any[] = []; // [cite: 24]
      let offset: number | undefined = undefined; // [cite: 24]
      const batchSize = 100; // Fetch in larger batches if needed to cover "last N" or date range // [cite: 25]

      // Iterate through all points matching the filter (or all points if no filter)
      // until we have enough or run out of points.
      while (true) { // [cite: 26]
        log('info', `[Qdrant] Scrolling with offset: ${offset || 'start'}, batch size: ${batchSize}`); // [cite: 26]
        const response = await qdrantClient.scroll("documents", { // [cite: 27]
          limit: batchSize, // [cite: 27]
          offset, // [cite: 27]
          with_payload: true, // [cite: 27]
          filter: commonFilter.must.length > 0 ? commonFilter : undefined, // [cite: 27]
          // No direct sort_by here, we'll sort in memory
        }); // [cite: 27]

        const { points, next_page_offset } = response; // [cite: 28]
        allPointsForSorting.push(...points); // [cite: 28]
        log('info', `[Qdrant] Fetched ${points.length} points in current scroll batch. Total collected: ${allPointsForSorting.length}`); // [cite: 28]

        if (!next_page_offset) { // [cite: 29]
          log('info', '[Qdrant] No more pages to scroll.'); // [cite: 29]
          break; // [cite: 29]
        } // [cite: 30]
        offset = Number(next_page_offset); // [cite: 30]
      } // [cite: 31]

      // Sort all collected points by timestamp descending and take the limit
      searchResults = allPointsForSorting // [cite: 31]
        .filter((p) => p.payload?.timestamp) // [cite: 31]
        .sort((a, b) => { // [cite: 31]
            const timestampA = Number(a.payload!.timestamp); // [cite: 31]
            const timestampB = Number(b.payload!.timestamp); // [cite: 31]
            return sortOrder === "desc" ? timestampB - timestampA : timestampA - timestampB; // [cite: 31, 32]
        }) // [cite: 32]
        .slice(0, actualLimit); // [cite: 32]

      log('info', `[Qdrant] Scroll (for chronological/date-range) retrieved ${allPointsForSorting.length} raw points.`); // [cite: 33]
      log('info', `[Qdrant] After in-memory sorting (${sortOrder} order) and limiting, using ${searchResults.length} points.`); // [cite: 33]

    } else { // [cite: 34]
      // Scenario 3: Semantic search with a specific user query (no date range and query is not generic). // [cite: 34]
      // This path prioritizes semantic relevance AND sorts by timestamp. // [cite: 35]
      log('info', "[Qdrant] Performing semantic search."); // [cite: 35]
      log('info', `[OpenAI] Requesting embedding for query:${query}`); // [cite: 35]
      const embeddingResponse = await openai.embeddings.create({ // [cite: 36]
        model: "text-embedding-3-small", // [cite: 36]
        input: query, // [cite: 36]
      }); // [cite: 36]
      const queryEmbedding = embeddingResponse.data[0].embedding; // [cite: 37]
      log('info', "[OpenAI] Embedding created."); // [cite: 37]

      searchResults = await qdrantClient.search("documents", { // [cite: 37]
        vector: queryEmbedding, // [cite: 37]
        limit: actualLimit, // [cite: 37]
        with_payload: true, // [cite: 37]
        filter: commonFilter.must.length > 0 ? commonFilter : undefined, // Filter if commonFilter was populated somehow (unlikely in this branch unless logic changes) // [cite: 37]
        params: { // [cite: 37]
          indexed_only_payload: true, // [cite: 37]
          sort_by: { // [cite: 37]
            key: "timestamp", // [cite: 38]
            direction: sortOrder === "asc" ? "asc" : "desc", // Apply sort_order here as well // [cite: 38]
          }, // [cite: 38]
        }, // [cite: 38]
      }); // [cite: 38]
      log('info', `[Qdrant] Semantic search retrieved ${searchResults.length} points.`); // [cite: 39]
    } // [cite: 39]


    const context = searchResults // [cite: 39]
      .map((res: any) => { // [cite: 39]
        const payload = res.payload; // [cite: 39]
        const extractedTextContent = payload.extractedText || "No extracted text available."; // [cite: 39]

        const messages = Array.isArray(payload.chatHistory) // [cite: 39]
          ? payload.chatHistory // [cite: 39]
              .map( // [cite: 40]
                (msg: any) => // [cite: 40]
                  `${ // [cite: 40]
                    msg.role === "user" ? "User" : "Assistant" // [cite: 40]
                  }: ${msg.text.replace(/(\*\*|__)/g, "")}` // [cite: 40]
              ) // [cite: 40]
              .join("\n") // [cite: 40]
          : ""; // [cite: 41]
        return `--- Document Start ---\nExtracted Text: ${ // [cite: 41]
          extractedTextContent // [cite: 41]
        }\nAssociated Chat History:\n${messages}\nTimestamp: ${ // [cite: 41]
          payload.timestamp ? new Date(payload.timestamp).toISOString() : "N/A" // [cite: 41]
        }\n--- Document End ---`; // [cite: 41]
      }) // [cite: 41]
      .join("\n\n"); // [cite: 41]

    if (context.trim() === "") { // [cite: 42]
        log('info', '[Qdrant] No historical context found for the query and filters.'); // [cite: 42]
    } else { // [cite: 43]
        log('info', '[Qdrant] Historical context formatted successfully.'); // [cite: 43]
    } // [cite: 44]
    return context.trim() || "No specific historical context was found based on the query and filters."; // [cite: 44]
  } catch (error) { // [cite: 45]
    // ❌ ERROR: Log specific Qdrant/embedding error
    log('error', `[Qdrant][ERROR] Error during historical document search: ${(error as Error).message}`); // [cite: 45]
    return `Error retrieving historical data: ${(error as Error).message}`; // [cite: 46]
  }
}

export async function POST(req: NextRequest) {
  log('info', '[Request] Received POST request for chat processing.'); // [cite: 46]
  try { // [cite: 47]
    // ℹ️ INFO: Parsing request body
    const body = await req.json(); // [cite: 47]
    const { chat, extractedText } = body; // [cite: 48]
    log('info', '[Request] Parsed request body (chat & extractedText present).'); // [cite: 48]

    // ⚠️ WARNING: Missing fields check
    if (!chat?.length || !extractedText) { // [cite: 49]
      log('warn', '[Validation] Missing required fields: chat history or extracted text.'); // [cite: 49]
      return NextResponse.json( // [cite: 50]
        { error: "Missing chat history or extracted text" }, // [cite: 50]
        { status: 400 } // [cite: 50]
      ); // [cite: 50]
    } // [cite: 51]

    const lastUserMessage = chat[chat.length - 1].text; // [cite: 51]
    log('info', `[Chat] Last user message: "${lastUserMessage.substring(0, 50)}..."`); // [cite: 51, 52]

    log('info', "[OpenAI] Calling OpenAI (Initial Tool Decision model: gpt-4o)"); // [cite: 52]
    const initialResponse = await openai.chat.completions.create({ // [cite: 53]
      model: "gpt-4o", // [cite: 53]
      messages: [ // [cite: 53]
        { // [cite: 53]
          role: "system", // [cite: 53]
          content: `You are a helpful assistant. Your primary role is to answer questions. If the user's query requires searching through past documents or chat sessions (e.g., "what did I send yesterday?", "show me emails from last week", "what was extracted on May 1st?", "all documents from today", "show me the last 5 documents", "list the 3 most recent entries", "show me the last 5 records"), use the 'search_historical_documents' tool. Otherwise, prepare to answer based on the current document or engage in general conversation. // [cite: 53, 54]

          **All date and time calculations MUST be performed in UTC.**
          Current UTC date for temporal queries is: ${moment.utc().format("YYYY-MM-DD")}.

          When extracting dates for the tool, ensure they are in ISO 8601 format (YYYY-MM-DDTHH:mm:ssZ) and represent UTC times:
          - For 'today' or 'this day', use current_utc_dateT00:00:00Z to current_utc_dateT23:59:59Z. // [cite: 55]
          - For 'yesterday', use current_utc_date_minus_1_dayT00:00:00Z to current_utc_date_minus_1_dayT23:59:59Z. // [cite: 55]
          - For 'last week', use the UTC start of last Monday to the UTC end of last Sunday (ISO week). // [cite: 56]
          - For 'this week', use the UTC start of this Monday to the UTC end of this Sunday (ISO week). // [cite: 57]
          **IMPORTANT:** The 'search_historical_documents' tool always requires a 'query' parameter. // [cite: 58]
          - If the user explicitly provides a search query (e.g., "what about the standard service?", "search for 'welcome' entries"), use that as the 'query'. // [cite: 58]
          - If the user asks for a specific number of documents chronologically (e.g., "show me the last 5 documents", "list the 3 most recent entries", "show me the last 5 records"), and **does not provide a specific content query**, use a generic but descriptive query like "document content", "extracted text", "past interactions", or "records" for the 'query' parameter. // [cite: 59]
          This specific generic query will signal to the backend to perform a purely chronological search. // [cite: 60]
          - If the user asks for a specific number of documents (e.g., "last 5", "top 3", "most recent 10"), set the 'limit' parameter in the tool call accordingly. // [cite: 61]
          If no number is specified but a historical search is needed (e.g., "what did I do yesterday?"), use a default limit of 10. // [cite: 62]
          - **When the user asks for the "first N" or "oldest N" documents, set 'sort_order' to 'asc'. // [cite: 62]
          Otherwise, if the user asks for "last N" or "most recent N" documents, set 'sort_order' to 'desc'. // [cite: 63]
          If not specified, default 'sort_order' to 'desc'.** // [cite: 64]
          `, // [cite: 64]
        }, // [cite: 64]
        { // [cite: 64]
          role: "user", // [cite: 64]
          content: `Latest User Query: "${lastUserMessage}"`, // [cite: 64]
        }, // [cite: 64]
      ], // [cite: 64]
      tools: [ragTool], // [cite: 64]
      tool_choice: "auto", // [cite: 64]
    }); // [cite: 64]

    // ℹ️ INFO: Log OpenAI initial request tokens
    log('info', `[OpenAI] Initial request (gpt-4o) tokens used - Prompt: ${initialResponse.usage?.prompt_tokens}, Completion: ${initialResponse.usage?.completion_tokens}`); // [cite: 65]

    const responseMessage = initialResponse.choices[0].message; // [cite: 66]
    let assistantResponseText: string | null = null; // [cite: 66]

    if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) { // [cite: 67]
      log('info', "[OpenAI] LLM decided to call a tool."); // [cite: 67]
      const toolCall = responseMessage.tool_calls[0]; // [cite: 68]

      if (toolCall.function.name === "search_historical_documents") { // [cite: 68]
        const { query, start_date, end_date, limit, sort_order } = JSON.parse(toolCall.function.arguments); // [cite: 68]
        log('info', `[Tool Call] Executing 'search_historical_documents' with args: Query: "${query}", Start: "${start_date || 'N/A'}", End: "${end_date || 'N/A'}", Limit: "${limit || 'default'}", Sort Order: "${sort_order || 'default'}"`); // [cite: 69]

        const toolOutput = await searchHistoricalDocuments(query, start_date, end_date, limit, sort_order); // [cite: 70]
        log('info', `[Tool Call] Historical search completed. Output length:${toolOutput.length}`); // [cite: 70]


        log('info', "[OpenAI] Calling OpenAI (Final Response After Tool Call model: gpt-4o)"); // [cite: 71]
        const finalResponseAfterTool = await openai.chat.completions.create({ // [cite: 72]
          model: "gpt-4o", // [cite: 72]
          messages: [ // [cite: 72]
            { // [cite: 72]
              role: "system", // [cite: 72]
              content: `You are a helpful assistant. Your goal is to answer the user's question by combining information from the current document (if relevant) and any relevant historical data provided.

              Here is the current extracted text from the image for the active session: // [cite: 73]
              """
              ${extractedText}
              """

              Here is the full conversation history:
              ${chat // [cite: 74]
                .map( // [cite: 74]
                  (msg: any) => // [cite: 74]
                    `${msg.role === "user" ? "User" : "Assistant"}: ${msg.text}` // [cite: 74]
                ) // [cite: 74]
                .join("\n")}

              **Historical Context (from tool call):** // [cite: 75]
              """
              ${toolOutput}
              """

              **IMPORTANT INSTRUCTIONS:**
              - Answer the user's question concisely, using information from the "current extracted text" AND the "historical context" as needed. // [cite: 76]
              - When presenting historical documents, list them clearly, stating their extracted text and associated timestamp. // [cite: 77]
              - All timestamps should be presented in ISO 8601 UTC format. // [cite: 78]
              - If the answer is not present in **either** the current extracted text or the provided historical context, state: "I'm sorry, I don't have enough information from the documents or historical data to answer that." // [cite: 78]
              - Do NOT invent information. // [cite: 79]
              - Pay attention to the user's latest question and its potential temporal or contextual implications. // [cite: 79]
              `, // [cite: 80]
            }, // [cite: 80]
            { // [cite: 80]
              role: "user", // [cite: 80]
              content: lastUserMessage, // [cite: 80]
            }, // [cite: 80]
            responseMessage, // [cite: 80]
            { // [cite: 80]
                tool_call_id: toolCall.id, // [cite: 81]
                role: "tool", // [cite: 81]
                content: toolOutput, // [cite: 81]
            } // [cite: 81]
          ], // [cite: 81]
        }); // [cite: 81]
        // ℹ️ INFO: Log OpenAI final request tokens
        log('info', `[OpenAI] Final response after tool (gpt-4o) tokens used - Prompt: ${finalResponseAfterTool.usage?.prompt_tokens}, Completion: ${finalResponseAfterTool.usage?.completion_tokens}`); // [cite: 82, 83]
        assistantResponseText = finalResponseAfterTool.choices[0].message.content; // [cite: 83]
        log('info', "[OpenAI] Final assistant response generated."); // [cite: 83]

      } else { // [cite: 84]
        // ⚠️ WARNING: Unexpected tool call
        log('warn', `[Tool Call] Unexpected tool called: ${toolCall.function.name}`); // [cite: 84]
        assistantResponseText = "An unexpected tool was called. Please try again."; // [cite: 85]
      }

    } else { // [cite: 86]
      log('info', "[Gemini] LLM called: Gemini 1.5 Pro (Direct Response - no tool needed)"); // [cite: 86]
      const historyText = chat // [cite: 87]
        .map( // [cite: 87]
          (msg: any) => // [cite: 87]
            `${msg.role === "user" ? "User" : "Assistant"}: ${msg.text}` // [cite: 87]
        ) // [cite: 87]
        .join("\n"); // [cite: 87]

      const finalPromptContent = ` // [cite: 88]
You are a helpful assistant whose sole purpose is to answer questions **only about the extracted text from a handwritten document**. // [cite: 88]

Here is the extracted text from the image: // [cite: 89]
"""
${extractedText}
"""

Here is the conversation so far:
${historyText}

**IMPORTANT:**
- Only answer questions that relate to the extracted text above. // [cite: 90]
- If the user asks something unrelated to this document, politely respond that you can only answer questions about the document. // [cite: 90]
- Do NOT make up answers or provide unrelated information. // [cite: 91]
- If the answer is not in the extracted text, say: "I'm sorry, I don't have information about that in the document." // [cite: 92]
Continue the conversation accordingly. // [cite: 93]
`; // [cite: 93]
      const result = await generateText({ // [cite: 93]
        model: google("gemini-1.5-pro"), // [cite: 93]
        prompt: finalPromptContent, // [cite: 93]
      }); // [cite: 93]
      assistantResponseText = result.text; // [cite: 94]
      // ℹ️ INFO: Log Gemini tokens
      log('info', `[Gemini] Direct response (gemini-1.5-pro) tokens used - Prompt: ${result.usage?.promptTokens}, Completion: ${result.usage?.completionTokens}`); // [cite: 94, 95]
      log('info', `[Gemini] Direct assistant response generated.`); // [cite: 95]
    } // [cite: 95]

    if (assistantResponseText === null) { // [cite: 95]
      // ❌ ERROR: No response generated
      log('error', "[Response] Could not generate a response, assistantResponseText is null."); // [cite: 95]
        return NextResponse.json( // [cite: 96]
            { error: "Could not generate a response." }, // [cite: 96]
            { status: 500 } // [cite: 96]
        ); // [cite: 96]
    } // [cite: 97]

    log('info', "[Response] Sending final response to client."); // [cite: 97]
    return NextResponse.json({ reply: assistantResponseText }); // [cite: 97]
  } catch (error) { // [cite: 98]
    // ❌ ERROR: Catch-all for API route errors
    log('error', `[Chat API][ERROR] General chat API error: ${(error as Error).message || 'Unknown error'}`); // [cite: 98]
    return NextResponse.json( // [cite: 99]
      { error: (error as Error).message || "Internal server error" }, // [cite: 99]
      { status: 500 } // [cite: 99]
    ); // [cite: 100]
  }
}