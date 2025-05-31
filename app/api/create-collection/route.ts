// app/api/create-collection/route.ts
import { qdrant } from '@/lib/qdrant';
import { createDataStream } from 'ai';
import { NextResponse } from 'next/server';

export async function GET() {
  const collectionName = 'documents';

  try {
    const result = await qdrant.createCollection(collectionName, {
      vectors: {
        size: 1536,        // or whatever vector size your model gives
        distance: 'Cosine' // or 'Dot' or 'Euclid'
      },
    });

    return NextResponse.json({ status: 'Collection created', result });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Failed to create collection' }, { status: 500 });
  }
}
