// Edge Function: retrieve-context
// Called on-demand when the user initiates a context transfer.
// Accepts a list of conversation_ids and an intent string, then:
//   1. Embeds the intent via Voyage AI
//   2. Runs pgvector similarity search over the chunks table
//   3. Reranks top-30 results to top-12 via Voyage AI rerank-2
//   4. Assembles and returns a KnowledgeBrief

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const VOYAGE_API_KEY = Deno.env.get("VOYAGE_API_KEY")!;
const VOYAGE_EMBED_URL = "https://api.voyageai.com/v1/embeddings";
const VOYAGE_RERANK_URL = "https://api.voyageai.com/v1/rerank";
const VOYAGE_EMBED_MODEL = "voyage-3-lite";
const VOYAGE_RERANK_MODEL = "rerank-2";

interface ChunkRow {
  id: string;
  conversation_id: string;
  content_type: "text" | "code" | "table";
  raw_content: string;
  metadata: { language?: string; tableHeaders?: string[] };
  similarity: number;
}

interface KnowledgeBrief {
  synthesizedContext: string;
  keyArtifacts: { type: string; content: string; label: string }[];
  openQuestions: string[];
  topicTags: string[];
  sourceCount: number;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Verify Bearer auth token
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response("Unauthorized", { status: 401 });
  }

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: { conversation_ids: string[]; intent: string };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { conversation_ids, intent } = body;
  if (!conversation_ids?.length || !intent?.trim()) {
    return new Response("conversation_ids and intent are required", { status: 400 });
  }

  try {
    // ── Step 1: Embed the intent string ──────────────────────────────────────
    const embedRes = await fetch(VOYAGE_EMBED_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${VOYAGE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: [intent],
        model: VOYAGE_EMBED_MODEL,
      }),
    });

    if (!embedRes.ok) {
      const err = await embedRes.text();
      throw new Error(`Voyage embed failed: ${err}`);
    }

    const embedData = await embedRes.json();
    const queryVector: number[] = embedData.data?.[0]?.embedding;
    if (!queryVector) throw new Error("No embedding returned from Voyage AI");

    // ── Step 2: pgvector similarity search scoped to selected conversations ──
    const { data: chunks, error: searchError } = await supabase.rpc(
      "search_chunks",
      {
        query_embedding: queryVector,
        conversation_ids,
        match_count: 30,
      }
    );

    // Fall back to raw SQL if the RPC doesn't exist yet
    let rows: ChunkRow[];
    if (searchError) {
      const vectorLiteral = `[${queryVector.join(",")}]`;
      const { data: rawRows, error: rawError } = await supabase
        .from("chunks")
        .select("id, conversation_id, content_type, raw_content, metadata, embedding")
        .in("conversation_id", conversation_ids);

      if (rawError) throw rawError;

      // Compute similarity client-side as fallback (less efficient but correct)
      rows = ((rawRows ?? []) as Array<ChunkRow & { embedding: number[] }>)
        .map((r) => ({
          ...r,
          similarity: cosineSimilarity(queryVector, r.embedding),
        }))
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 30);
    } else {
      rows = (chunks ?? []) as ChunkRow[];
    }

    if (!rows.length) {
      const brief: KnowledgeBrief = {
        synthesizedContext: "",
        keyArtifacts: [],
        openQuestions: [],
        topicTags: [],
        sourceCount: 0,
      };
      return new Response(JSON.stringify(brief), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // ── Step 3: Rerank top-30 via Voyage AI rerank-2 ─────────────────────────
    const documents = rows.map((r) => r.raw_content);

    const rerankRes = await fetch(VOYAGE_RERANK_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${VOYAGE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: intent,
        documents,
        model: VOYAGE_RERANK_MODEL,
        top_k: 12,
      }),
    });

    let top12: ChunkRow[];
    if (rerankRes.ok) {
      const rerankData = await rerankRes.json();
      const results: Array<{ index: number; relevance_score: number }> =
        rerankData.data ?? [];
      top12 = results
        .sort((a, b) => b.relevance_score - a.relevance_score)
        .map((r) => rows[r.index]);
    } else {
      // If rerank fails, fall back to similarity ordering
      console.error("Voyage rerank failed:", await rerankRes.text());
      top12 = rows.slice(0, 12);
    }

    // ── Step 4: Assemble KnowledgeBrief ──────────────────────────────────────
    const textChunks = top12.filter((c) => c.content_type === "text");
    const artifactChunks = top12.filter(
      (c) => c.content_type === "code" || c.content_type === "table"
    );

    const keyArtifacts = artifactChunks.map((c) => ({
      type: c.content_type,
      content: c.raw_content,
      label:
        c.content_type === "code"
          ? (c.metadata?.language ?? "code")
          : (c.metadata?.tableHeaders?.join(", ") ?? "table"),
    }));

    const synthesizedContext = textChunks
      .map((c) => c.raw_content.trim())
      .join("\n\n");

    const openQuestions = textChunks
      .flatMap((c) =>
        c.raw_content
          .split(/(?<=[.!?])\s+/)
          .filter((s) => s.trimEnd().endsWith("?"))
          .map((s) => s.trim())
      )
      .filter(Boolean);

    const sourceCount = new Set(top12.map((c) => c.conversation_id)).size;

    const brief: KnowledgeBrief = {
      synthesizedContext,
      keyArtifacts,
      openQuestions,
      topicTags: [],
      sourceCount,
    };

    return new Response(JSON.stringify(brief), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("retrieve-context error:", error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}
