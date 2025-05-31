import { QdrantClient } from '@qdrant/js-client-rest';

export const qdrant = new QdrantClient({
  url: process.env.QDRANT_HOST!,   // ✅ Make sure this uses port 633
  apiKey: process.env.QDRANT_API_KEY!, // ✅ Valid API Key
  timeout: 10000,  // ✅ You CAN use this
});

