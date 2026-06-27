// Processes a conversation locally in the extension:
// 1. Extracts summary using local extractive summarization (no API)
// 2. Generates embeddings using local MiniLM model (no API)
// 3. Updates conversation in Firestore
// 4. Creates and stores searchable chunks

import { getDb, getAuthenticatedUser } from "./firebase-client.js";
import { doc, updateDoc, collection, query, where, getDocs, writeBatch, Timestamp } from "firebase/firestore";
import { saveChunks, getChunksByConversation, deleteChunksByConversation, type LocalChunk } from "../local-db/index.js";
import { embedTexts } from "./local-embeddings.js";
import { extractSummary } from "./extractive-summary.js";

interface RawMessage {
  role: string;
  content: string;
}

// ── Chunking ─────────────────────────────────────────────────────────────────

function extractCodeBlocks(text: string): { blocks: Array<{ language: string; body: string }>; remainder: string } {
  const blocks: Array<{ language: string; body: string }> = [];
  const remainder = text.replace(/```([^\n`]*)\n([\s\S]*?)```/g, (_m, lang: string, body: string) => {
    blocks.push({ language: lang.trim(), body: body.trim() });
    return "\n";
  });
  return { blocks, remainder };
}

function splitProse(text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const chunks: string[] = [];
  let start = 0;
  while (start < words.length) {
    const end = Math.min(start + 300, words.length);
    chunks.push(words.slice(start, end).join(" "));
    if (end === words.length) break;
    start = end - 50;
  }
  return chunks;
}

// ── Main processing function ─────────────────────────────────────────────────

export async function processConversation(
  conversationId: string,
  rawMessages: RawMessage[],
  title: string,
): Promise<void> {
  if (rawMessages.length < 2) return;

  const authData = await getAuthenticatedUser();
  if (!authData) return;

  const db = getDb();

  try {
    // Step 1: Summarize (HF API with local fallback)
    const parsed = await extractSummary(rawMessages.slice(0, 30));

    // Step 2: Update conversation in Firestore
    const convRef = doc(db, "conversations", conversationId);
    await updateDoc(convRef, {
      summary: parsed.summary || null,
      keyPoints: parsed.keyPoints.length ? parsed.keyPoints : null,
      openQuestions: parsed.openQuestions.length ? parsed.openQuestions : null,
      topics: parsed.topics.length ? parsed.topics : null,
      processedAt: Timestamp.now(),
    });

    // Step 3: Create chunks
    interface PendingChunk {
      contentType: "text" | "code";
      rawContent: string;
      processedContent: string;
      metadata: Record<string, unknown>;
    }

    const pending: PendingChunk[] = [];
    for (const msg of rawMessages) {
      const content = (msg.content ?? "").trim();
      if (!content) continue;

      const { blocks, remainder } = extractCodeBlocks(content);
      for (const cb of blocks) {
        pending.push({
          contentType: "code",
          rawContent: "```" + cb.language + "\n" + cb.body + "\n```",
          processedContent: cb.language ? `[${cb.language} code]\n${cb.body}` : cb.body,
          metadata: { language: cb.language || undefined, role: msg.role },
        });
      }

      const prose = remainder.replace(/\n{3,}/g, "\n\n").trim();
      if (prose) {
        for (const chunk of splitProse(prose)) {
          pending.push({
            contentType: "text",
            rawContent: chunk,
            processedContent: chunk,
            metadata: { role: msg.role },
          });
        }
      }
    }

    if (pending.length === 0) return;

    // Step 4: Embed all chunks
    const embeddings = await embedTexts(pending.map((p) => p.processedContent));

    // Step 5: Save chunks to IndexedDB (local-first)
    await deleteChunksByConversation(conversationId);
    const localChunks: LocalChunk[] = pending.map((p, idx) => ({
      id: `${conversationId}-${idx}`,
      conversationId,
      contentType: p.contentType,
      rawContent: p.rawContent,
      processedContent: p.processedContent,
      chunkIndex: idx,
      embedding: embeddings[idx] ?? [],
      metadata: p.metadata,
      createdAt: Date.now(),
    }));
    await saveChunks(localChunks);

    // Step 6: Also push to Firestore for cross-device sync
    const oldChunks = await getDocs(
      query(collection(db, "chunks"), where("conversationId", "==", conversationId))
    );
    if (!oldChunks.empty) {
      const delBatch = writeBatch(db);
      oldChunks.docs.forEach((d) => delBatch.delete(d.ref));
      await delBatch.commit();
    }

    for (let i = 0; i < pending.length; i += 400) {
      const batch = writeBatch(db);
      const slice = pending.slice(i, i + 400);

      slice.forEach((p, j) => {
        const idx = i + j;
        const ref = doc(collection(db, "chunks"));
        const data: Record<string, unknown> = {
          conversationId,
          contentType: p.contentType,
          rawContent: p.rawContent,
          processedContent: p.processedContent,
          chunkIndex: idx,
          metadata: p.metadata,
          userId: authData.user.uid,
          createdAt: Timestamp.now(),
        };

        if (embeddings[idx]?.length > 0) {
          data.embedding = embeddings[idx];
        }

        batch.set(ref, data);
      });

      await batch.commit();
    }

    console.log(`[Stash] Processed conversation ${conversationId}: ${pending.length} chunks`);
  } catch (e) {
    console.error("[Stash] processConversation error:", e);
  }
}

// ── Retrieve context (vector search) ─────────────────────────────────────────

export async function retrieveContext(
  conversationIds: string[],
  intent: string,
): Promise<{ synthesizedContext: string; keyArtifacts: Array<{ type: string; content: string; label: string }>; openQuestions: string[]; topicTags: string[]; sourceCount: number }> {
  const empty = { synthesizedContext: "", keyArtifacts: [], openQuestions: [], topicTags: [], sourceCount: 0 };

  const [queryEmbedding] = await embedTexts([intent]);
  if (!queryEmbedding?.length) return empty;

  // Read chunks from IndexedDB (local-first, instant)
  const allChunks: Array<{ contentType: string; rawContent: string; metadata: Record<string, unknown>; conversationId: string; similarity: number }> = [];

  for (const convId of conversationIds) {
    const localChunks = await getChunksByConversation(convId);

    for (const chunk of localChunks) {
      if (chunk.embedding.length > 0) {
        allChunks.push({
          contentType: chunk.contentType,
          rawContent: chunk.rawContent,
          metadata: chunk.metadata,
          conversationId: chunk.conversationId,
          similarity: cosineSimilarity(queryEmbedding, chunk.embedding),
        });
      }
    }
  }

  allChunks.sort((a, b) => b.similarity - a.similarity);
  const top12 = allChunks.slice(0, 12);

  if (!top12.length) return empty;

  const textChunks = top12.filter((c) => c.contentType === "text");
  const artifactChunks = top12.filter((c) => c.contentType === "code");

  return {
    synthesizedContext: textChunks.map((c) => c.rawContent.trim()).join("\n\n"),
    keyArtifacts: artifactChunks.map((c) => ({
      type: c.contentType,
      content: c.rawContent,
      label: (c.metadata?.language as string) ?? "code",
    })),
    openQuestions: textChunks
      .flatMap((c) => c.rawContent.split(/(?<=[.!?])\s+/).filter((s) => s.trimEnd().endsWith("?")))
      .filter(Boolean),
    topicTags: [],
    sourceCount: new Set(top12.map((c) => c.conversationId)).size,
  };
}

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
