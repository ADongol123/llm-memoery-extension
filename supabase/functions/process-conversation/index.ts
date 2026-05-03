// Edge Function: process-conversation
// Triggered by a DB webhook when a conversation row is inserted.
// Runs: 1 Claude Haiku call (summarize + extract in one structured call)
//       1 Voyage AI call (generate embedding)
// Then updates the conversation row with the results.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Anthropic from "https://esm.sh/@anthropic-ai/sdk";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const anthropic = new Anthropic({
  apiKey: Deno.env.get("ANTHROPIC_API_KEY")!,
});

const VOYAGE_API_KEY = Deno.env.get("VOYAGE_API_KEY")!;
const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";
const VOYAGE_MODEL   = "voyage-3-lite";

// System prompt is long and reusable — perfect for prompt caching.
const SYSTEM_PROMPT = `You are a conversation analyst for an AI memory system.
Given a chat conversation between a user and an AI assistant, extract structured information.

Always respond with valid JSON matching exactly this schema:
{
  "summary": "2-3 sentences describing what was discussed and any outcomes",
  "keyPoints": ["array of decisions or conclusions reached, as short statements"],
  "openQuestions": ["array of questions or problems left unresolved"],
  "topics": ["array of 3-7 topic tags, lowercase, specific"],
  "entities": {
    "code": [{"language": "string", "snippet": "string (first 200 chars)", "description": "one line"}],
    "decisions": ["specific technical or design decisions made"],
    "people": ["names of people mentioned"],
    "projects": ["project or product names mentioned"],
    "urls": ["URLs or resource references mentioned"]
  }
}

Rules:
- keyPoints: focus on what was DECIDED or CONCLUDED, not what was asked
- openQuestions: things that were raised but not resolved
- topics: be specific (e.g. "react-performance" not "programming")
- code: only include if actual code was produced in the conversation
- Respond with JSON only, no markdown fences`;

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let body: { record?: { id: string; raw_messages: unknown[]; title: string } };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const record = body.record;
  if (!record?.id || !record?.raw_messages) {
    return new Response("Missing record", { status: 400 });
  }

  const conversationId = record.id;

  // Skip if already processed or very short
  if (!Array.isArray(record.raw_messages) || record.raw_messages.length < 2) {
    return new Response("Skipped: too short", { status: 200 });
  }

  try {
    // Format messages for the prompt
    const msgText = (record.raw_messages as Array<{ role: string; content: string }>)
      .slice(0, 30)  // cap at 30 messages to control cost
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content.slice(0, 500)}`)
      .join("\n\n");

    // ── Step 1: Claude Haiku — summarize + extract in one call ────────────────
    const aiResponse = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },  // prompt caching — ~50% cost reduction
        },
      ],
      messages: [
        {
          role: "user",
          content: `Analyze this conversation:\n\n${msgText}`,
        },
      ],
    });

    const aiText = aiResponse.content[0]?.type === "text" ? aiResponse.content[0].text : "{}";

    let parsed: {
      summary?: string;
      keyPoints?: string[];
      openQuestions?: string[];
      topics?: string[];
      entities?: {
        code?: Array<{ language: string; snippet: string; description: string }>;
        decisions?: string[];
        people?: string[];
        projects?: string[];
        urls?: string[];
      };
    } = {};

    try {
      parsed = JSON.parse(aiText);
    } catch {
      console.error("Failed to parse AI response:", aiText);
    }

    // ── Step 2: Voyage AI — generate embedding ────────────────────────────────
    const textToEmbed = [
      record.title,
      parsed.summary ?? "",
      (parsed.keyPoints ?? []).join(". "),
      (parsed.topics ?? []).join(" "),
    ].filter(Boolean).join("\n");

    let embedding: number[] | null = null;

    try {
      const voyageRes = await fetch(VOYAGE_API_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${VOYAGE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: [textToEmbed],
          model: VOYAGE_MODEL,
        }),
      });

      if (voyageRes.ok) {
        const voyageData = await voyageRes.json();
        embedding = voyageData.data?.[0]?.embedding ?? null;
      }
    } catch (e) {
      console.error("Voyage AI error:", e);
    }

    // ── Step 3: Update conversation row ──────────────────────────────────────
    const { error: updateError } = await supabase
      .from("conversations")
      .update({
        summary:        parsed.summary        ?? null,
        key_points:     parsed.keyPoints       ?? null,
        open_questions: parsed.openQuestions   ?? null,
        topics:         parsed.topics          ?? null,
        entities:       parsed.entities        ?? null,
        processed_at:   new Date().toISOString(),
      })
      .eq("id", conversationId);

    if (updateError) throw updateError;

    // ── Step 4: Store embedding in separate table ─────────────────────────────
    if (embedding) {
      await supabase
        .from("conversation_embeddings")
        .upsert({
          conversation_id: conversationId,
          embedding,
        });
    }

    return new Response(
      JSON.stringify({ success: true, conversationId }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("process-conversation error:", error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
