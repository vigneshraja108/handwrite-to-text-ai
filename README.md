# 🧠 Image Extraction Chatbot with RAG, Gemini AI, OpenAI & SendGrid

This is a powerful **AI chatbot** built using **Next.js**. It extracts text from handwritten images, summarizes content, supports Q&A over historical data using **RAG (Retrieval-Augmented Generation)** with **Qdrant**, and sends the extracted and summarized content via **email** using **Twilio SendGrid**. The project leverages both **OpenAI** and **Gemini AI**, and uses **pydantic-based structured logging** for observability.

---

## 🚀 Features

- 🖼️ **Image Extraction**: Upload handwritten images, extract text using Gemini AI.
- 🧠 **LLM Chat**: Supports natural language chat with extracted and historical context using Gemini.
- 🗃️ **RAG with Vector DB**: Stores and retrieves past data using **Qdrant** + **OpenAI embeddings**.
- 📩 **Send Email**: Automatically sends extracted content and summaries via **SendGrid**.
- 📅 **Date-based Metadata Filtering**: Supports filtering historical results with timestamps.
- 📊 **Structured Logging**: Uses `pydantic`-compatible structured logging via Logfire.

---

APPLICATION SETUP

1. Clone the repo:

        git clone https://github.com/your-repo/image-chatbot.git
        cd image-chatbot

2. Install dependencies:

        npm install

3. Create .env.local:

        OPENAI_API_KEY=your-openai-key
        GOOGLE_API_KEY=your-gemini-key
        SENDGRID_API_KEY=your-sendgrid-key
        LOGGER_API_KEY=your-logfire-token
        NEXT_PUBLIC_DEFAULT_EMAIL=your@email.com
        QDRANT_URL=yourQdrant port
        QDRANT_API_KEY=your-qdrant-key

4. Start dev server:

        npm run dev

---

## 🏗️ Tech Stack

| Layer             | Tech Used                                |
|------------------|-------------------------------------------|
| Framework        | Next.js (App Router)                      |
| LLMs             | Gemini 1.5 Pro (Google), OpenAI GPT-4o    |
| Vector DB        | Qdrant (cloud)                      |
| Embeddings       | OpenAI `text-embedding-3-small`           |
| Email Service    | Twilio SendGrid                           |
| Logging          | Logfire + Pydantic                        |

---

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
