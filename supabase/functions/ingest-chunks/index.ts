// Edge Function: ingest-chunks
// Accepts POST { conversation_id: string }
// Fetches raw_messages from the conversations table, splits them into typed
// chunks (code blocks, markdown tables, prose), embeds each chunk via Voyage AI,
// and batch-inserts the results into the chunks table.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const VOYAGE_API_KEY = Deno.env.get("VOYAGE_API_KEY")!;
const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";
const VOYAGE_MODEL   = "voyage-3";

// Approximate tokens by word count (1 token ≈ 0.75 words).
// We target ~400 tokens per prose chunk → ~300 words.
const PROSE_CHUNK_WORDS = 300;
// Sliding window overlap in words.
const OVERLAP_WORDS = 50;

// ── Types ────────────────────────────────────────────────────────────────────

interface RawMessage {
  role: string;
  content: string;
}

interface ChunkRow {
  conversation_id: string;
  content_type: "text" | "code" | "table";
  raw_content: string;
  processed_content: string;
  chunk_index: number;
  embedding: number[] | null;
  metadata: Record<string, unknown>;
}

// ── Parsing helpers ───────────────────────────────────────────────────────────

/**
 * Extract fenced code blocks (``` … ```) from a string.
 * Returns an array of { language, body } objects and the text with those
 * blocks removed (so it can be processed further for tables / prose).
 */
function extractCodeBlocks(text: string): {
  blocks: Array<{ language: string; body: string }>;
  remainder: string;
} {
  const blocks: Array<{ language: string; body: string }> = [];
  // Matches ``` optionally followed by a language identifier, then the body.
  const codeRe = /```([^\n`]*)\n([\s\S]*?)```/g;
  const remainder = text.replace(codeRe, (_match, lang: string, body: string) => {
    blocks.push({ language: lang.trim(), body: body.trim() });
    return "\n"; // leave a blank line so surrounding prose stays intact
  });
  return { blocks, remainder };
}

/**
 * Extract contiguous markdown table runs (lines starting with |).
 * Returns the table strings and the text with those runs removed.
 */
function extractTables(text: string): {
  tables: Array<{ raw: string; headers: string[] }>;
  remainder: string;
} {
  const tables: Array<{ raw: string; headers: string[] }> = [];

  // A table run is one or more consecutive lines that start with |
  const tableRunRe = /(?:^|\n)((?:\|[^\n]*\n?)+)/g;
  const remainder = text.replace(
    tableRunRe,
    (_match, run: string) => {
      const trimmed = run.trim();
      if (!trimmed) return _match;
      const lines = trimmed.split("\n").filter((l) => l.trim().startsWith("|"));
      if (lines.length < 2) return _match; // not really a table

      // First non-separator line is the header row
      const headerLine = lines[0];
      const headers = headerLine
        .split("|")
        .map((h) => h.trim())
        .filter(Boolean);

      tables.push({ raw: trimmed, headers });
      return "\n";
    }
  );
  return { tables, remainder };
}

/**
 * Split prose text into sliding chunks of ~PROSE_CHUNK_WORDS words with
 * OVERLAP_WORDS word overlap between consecutive chunks.
 */
function splitProse(text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const chunks: string[] = [];
  let start = 0;

  while (start < words.length) {
    const end = Math.min(start + PROSE_CHUNK_WORDS, words.length);
    chunks.push(words.slice(start, end).join(" "));
    if (end === words.length) break;
    start = end - OVERLAP_WORDS;
  }

  return chunks;
}

// ── Voyage AI embedding ───────────────────────────────────────────────────────

/**
 * Embed a batch of strings via Voyage AI.
 * Returns an array of embedding vectors in the same order as the input.
 * On failure returns an array of nulls (we still insert the chunk, just
 * without a vector).
 */
async function embedBatch(texts: string[]): Promise<Array<number[] | null>> {
  if (texts.length === 0) return [];

  try {
    const res = await fetch(VOYAGE_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${VOYAGE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: texts,
        model: VOYAGE_MODEL,
      }),
    });

    if (!res.ok) {
      console.error("Voyage AI error:", res.status, await res.text());
      return texts.map(() => null);
    }

    const data = await res.json();
    // data.data is an array sorted by index
    const sorted = (data.data as Array<{ index: number; embedding: number[] }>)
      .sort((a, b) => a.index - b.index);
    return sorted.map((d) => d.embedding ?? null);
  } catch (e) {
    console.error("Voyage AI fetch error:", e);
    return texts.map(() => null);
  }
}

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let body: { conversation_id?: string };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const conversationId = body.conversation_id;
  if (!conversationId) {
    return new Response("Missing conversation_id", { status: 400 });
  }

  try {
    // ── Fetch raw_messages ────────────────────────────────────────────────────
    const { data: conv, error: fetchError } = await supabase
      .from("conversations")
      .select("raw_messages")
      .eq("id", conversationId)
      .single();

    if (fetchError) throw fetchError;
    if (!conv?.raw_messages) {
      return new Response(
        JSON.stringify({ success: false, error: "Conversation not found or has no messages" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const rawMessages = conv.raw_messages as RawMessage[];

    // ── Build pending chunks (without embeddings yet) ─────────────────────────
    // We collect { contentType, rawContent, processedContent, metadata }
    // then embed all processedContents in one batched call.

    interface PendingChunk {
      contentType: "text" | "code" | "table";
      rawContent: string;
      processedContent: string;
      metadata: Record<string, unknown>;
    }

    const pending: PendingChunk[] = [];

    for (const msg of rawMessages) {
      const content = (msg.content ?? "").trim();
      if (!content) continue;

      // 1. Strip code blocks
      const { blocks: codeBlocks, remainder: afterCode } = extractCodeBlocks(content);

      for (const cb of codeBlocks) {
        const processed = cb.language
          ? `[${cb.language} code]\n${cb.body}`
          : cb.body;
        pending.push({
          contentType: "code",
          rawContent: "```" + cb.language + "\n" + cb.body + "\n```",
          processedContent: processed,
          metadata: { language: cb.language || undefined, role: msg.role },
        });
      }

      // 2. Strip tables from the remaining text
      const { tables, remainder: afterTables } = extractTables(afterCode);

      for (const tbl of tables) {
        // processedContent: header labels joined for embedding signal
        const processed = `[table: ${tbl.headers.join(", ")}]\n${tbl.raw}`;
        pending.push({
          contentType: "table",
          rawContent: tbl.raw,
          processedContent: processed,
          metadata: { tableHeaders: tbl.headers, role: msg.role },
        });
      }

      // 3. Split leftover prose into sliding chunks
      const proseText = afterTables.replace(/\n{3,}/g, "\n\n").trim();
      if (proseText) {
        const proseChunks = splitProse(proseText);
        for (const chunk of proseChunks) {
          pending.push({
            contentType: "text",
            rawContent: chunk,
            processedContent: chunk,
            metadata: { role: msg.role },
          });
        }
      }
    }

    if (pending.length === 0) {
      return new Response(
        JSON.stringify({ success: true, chunksCreated: 0 }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // ── Embed all processedContents in one Voyage AI call ─────────────────────
    const textsToEmbed = pending.map((p) => p.processedContent);
    const embeddings = await embedBatch(textsToEmbed);

    // ── Assemble rows ─────────────────────────────────────────────────────────
    const rows: ChunkRow[] = pending.map((p, i) => ({
      conversation_id: conversationId,
      content_type:    p.contentType,
      raw_content:     p.rawContent,
      processed_content: p.processedContent,
      chunk_index:     i,
      embedding:       embeddings[i] ?? null,
      metadata:        p.metadata,
    }));

    // ── Delete any existing chunks for this conversation, then insert fresh ────
    await supabase
      .from("chunks")
      .delete()
      .eq("conversation_id", conversationId);

    const { error: insertError } = await supabase
      .from("chunks")
      .insert(rows);

    if (insertError) throw insertError;

    return new Response(
      JSON.stringify({ success: true, chunksCreated: rows.length }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("ingest-chunks error:", error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
