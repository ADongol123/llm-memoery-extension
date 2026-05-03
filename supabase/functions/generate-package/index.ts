// Edge Function: generate-package
// Called on-demand when the user selects conversations and clicks "Generate Package".
// Uses Claude Sonnet (higher quality) to produce a structured Context Package document.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Anthropic from "https://esm.sh/@anthropic-ai/sdk";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const anthropic = new Anthropic({
  apiKey: Deno.env.get("ANTHROPIC_API_KEY")!,
});

const SYSTEM_PROMPT = `You are generating a Context Package — a structured briefing document
that will be injected into a new AI conversation so it can pick up exactly where previous
conversations left off, without any re-explanation needed.

Your output must be a JSON object with exactly this schema:
{
  "title": "Short descriptive title for this context package",
  "summary": "3 sentences maximum. What was being worked on and what was achieved.",
  "decisionsMade": ["Array of specific decisions already made — the new AI should NOT re-discuss these"],
  "openQuestions": ["Array of questions or problems still unresolved — the new AI SHOULD address these"],
  "codeProduced": [
    {
      "language": "programming language",
      "snippet": "the actual code (first 300 chars if long)",
      "description": "one-line description of what this code does"
    }
  ],
  "whereWeLeftOff": "2-3 sentences describing the exact point in the conversation where work stopped",
  "suggestedNextSteps": ["Array of 2-5 concrete actions the new AI conversation should take next"],
  "sources": [
    {
      "platform": "Claude|ChatGPT|Gemini|Grok|DeepSeek",
      "title": "conversation title",
      "timestamp": "human readable date",
      "messageCount": 0
    }
  ]
}

Rules:
- Be specific and actionable, not vague
- decisionsMade should be past tense: "Decided to use X" not "Using X"
- openQuestions should be questions the next session should answer
- suggestedNextSteps should be concrete actions, not vague suggestions
- Output JSON only, no markdown fences`;

interface ConversationRow {
  id: string;
  platform: string;
  title: string;
  message_count: number;
  raw_messages: Array<{ role: string; content: string }>;
  summary: string | null;
  key_points: string[] | null;
  open_questions: string[] | null;
  topics: string[] | null;
  entities: {
    code?: Array<{ language: string; snippet: string; description: string }>;
    decisions?: string[];
  } | null;
  created_at: string;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Verify auth
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response("Unauthorized", { status: 401 });
  }

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: { conversationIds: string[]; name?: string };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { conversationIds, name } = body;
  if (!conversationIds?.length) {
    return new Response("conversationIds required", { status: 400 });
  }

  try {
    // Fetch the conversations
    const { data: conversations, error: fetchError } = await supabase
      .from("conversations")
      .select("*")
      .in("id", conversationIds)
      .eq("user_id", user.id);

    if (fetchError) throw fetchError;
    if (!conversations?.length) {
      return new Response("Conversations not found", { status: 404 });
    }

    const convRows = conversations as ConversationRow[];

    // Build a rich prompt from all conversations
    const convSections = convRows.map((conv, i) => {
      const header = `--- Conversation ${i + 1}: ${conv.platform} — "${conv.title}" ---`;

      // Prefer AI-processed data if available, fall back to raw
      if (conv.summary) {
        const parts = [
          header,
          `Summary: ${conv.summary}`,
          conv.key_points?.length
            ? `Key points:\n${conv.key_points.map((p) => `• ${p}`).join("\n")}`
            : "",
          conv.open_questions?.length
            ? `Open questions:\n${conv.open_questions.map((q) => `• ${q}`).join("\n")}`
            : "",
          conv.entities?.decisions?.length
            ? `Decisions:\n${conv.entities.decisions.map((d) => `• ${d}`).join("\n")}`
            : "",
          conv.entities?.code?.length
            ? `Code produced:\n${conv.entities.code.map((c) => `[${c.language}] ${c.description}: ${c.snippet.slice(0, 200)}`).join("\n")}`
            : "",
        ].filter(Boolean);
        return parts.join("\n");
      }

      // Fall back to last few messages of raw conversation
      const lastMsgs = (conv.raw_messages ?? [])
        .slice(-6)
        .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content.slice(0, 400)}`)
        .join("\n\n");

      return `${header}\n${lastMsgs}`;
    });

    const prompt = convSections.join("\n\n");

    // ── Claude Sonnet call ────────────────────────────────────────────────────
    const aiResponse = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Generate a Context Package from these ${convRows.length} conversation(s):\n\n${prompt}`,
        },
      ],
    });

    const aiText = aiResponse.content[0]?.type === "text" ? aiResponse.content[0].text : "{}";

    let docJson: {
      title?: string;
      summary?: string;
      decisionsMade?: string[];
      openQuestions?: string[];
      codeProduced?: Array<{ language: string; snippet: string; description: string }>;
      whereWeLeftOff?: string;
      suggestedNextSteps?: string[];
      sources?: Array<{ platform: string; title: string; timestamp: string; messageCount: number }>;
    } = {};

    try {
      docJson = JSON.parse(aiText);
    } catch {
      console.error("Failed to parse package AI response:", aiText.slice(0, 200));
      docJson = {
        title: name ?? convRows[0]?.title ?? "Context Package",
        summary: "Context from previous conversations.",
        decisionsMade: [],
        openQuestions: [],
        codeProduced: [],
        whereWeLeftOff: "See conversation history.",
        suggestedNextSteps: [],
        sources: convRows.map((c) => ({
          platform: c.platform,
          title: c.title,
          timestamp: c.created_at,
          messageCount: c.message_count,
        })),
      };
    }

    // ── Format the human-readable document ────────────────────────────────────
    const document = formatDocument(docJson);

    // ── Save to database ──────────────────────────────────────────────────────
    const { data: pkg, error: insertError } = await supabase
      .from("context_packages")
      .insert({
        user_id:       user.id,
        name:          name ?? docJson.title ?? convRows[0]?.title ?? "Context Package",
        description:   docJson.summary ?? "",
        document,
        document_json: docJson,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // Link conversations to the package
    if (pkg && conversationIds.length) {
      await supabase.from("package_conversations").insert(
        conversationIds.map((cid, i) => ({
          package_id:      pkg.id,
          conversation_id: cid,
          weight:          i === 0 ? "primary" : "supporting",
        }))
      );
    }

    // Bump analytics
    if (user.id) {
      await supabase.rpc("bump_analytics", {
        p_user_id: user.id,
        p_field:   "packages_generated",
      });
    }

    return new Response(
      JSON.stringify({ success: true, package: pkg, document }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("generate-package error:", error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

function formatDocument(doc: typeof Object.prototype): string {
  const title       = doc.title         ?? "Context Package";
  const summary     = doc.summary       ?? "";
  const decisions   = doc.decisionsMade ?? [];
  const questions   = doc.openQuestions ?? [];
  const code        = doc.codeProduced  ?? [];
  const leftOff     = doc.whereWeLeftOff     ?? "";
  const nextSteps   = doc.suggestedNextSteps ?? [];
  const sources     = doc.sources       ?? [];

  const border = "═".repeat(62);
  const thin   = "─".repeat(40);

  const lines: string[] = [
    `╔${border}╗`,
    `║  CONTEXT PACKAGE: ${title.slice(0, 42).padEnd(42)} ║`,
    `╚${border}╝`,
    ``,
    `SUMMARY`,
    thin,
    summary,
    ``,
  ];

  if (decisions.length) {
    lines.push(`DECISIONS ALREADY MADE`);
    lines.push(`(Do not re-discuss — these are settled)`);
    lines.push(thin);
    decisions.forEach((d: string) => lines.push(`• ${d}`));
    lines.push(``);
  }

  if (questions.length) {
    lines.push(`OPEN QUESTIONS`);
    lines.push(`(These still need solving)`);
    lines.push(thin);
    questions.forEach((q: string) => lines.push(`• ${q}`));
    lines.push(``);
  }

  if (code.length) {
    lines.push(`CODE PRODUCED`);
    lines.push(thin);
    code.forEach((c: { language: string; description: string; snippet: string }) => {
      lines.push(`[${c.language}] ${c.description}`);
      lines.push(`\`\`\`${c.language}`);
      lines.push(c.snippet);
      lines.push(`\`\`\``);
    });
    lines.push(``);
  }

  if (leftOff) {
    lines.push(`WHERE WE LEFT OFF`);
    lines.push(thin);
    lines.push(leftOff);
    lines.push(``);
  }

  if (nextSteps.length) {
    lines.push(`SUGGESTED NEXT STEPS`);
    lines.push(thin);
    nextSteps.forEach((s: string) => lines.push(`• ${s}`));
    lines.push(``);
  }

  if (sources.length) {
    const src = sources.map((s: { platform: string; messageCount: number }) => `${s.platform} (${s.messageCount} msgs)`).join(", ");
    lines.push(`Sources: ${src}`);
  }

  lines.push(``, `[Acknowledge this context, then continue from WHERE WE LEFT OFF. Everything above is already decided.]`);

  return lines.join("\n");
}
