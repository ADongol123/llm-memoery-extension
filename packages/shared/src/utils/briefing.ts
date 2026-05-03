import type {
  Conversation,
  ContextPackage,
  ContextPackageDocument,
  BriefingMode,
  Platform,
} from "../types/index.js";
import { trimMessages } from "./trim.js";

// ── Single conversation briefing ───────────────────────────────────────────────

export function buildBriefing(conv: Conversation, mode: BriefingMode = "full"): string {
  if (conv.isSnippet) return buildSnippetBriefing(conv);

  switch (mode) {
    case "keypoints": return buildKeypointsBriefing(conv);
    case "summary":   return buildSummaryBriefing(conv);
    case "full":      return buildFullBriefing(conv);
  }
}

function buildSnippetBriefing(conv: Conversation): string {
  const text = conv.rawMessages[0]?.content ?? "";
  return (
    `[Snippet from ${conv.platform} — ${formatDate(conv.createdAt)}]\n\n` +
    text +
    `\n\n[Reference this snippet in your response.]`
  );
}

function buildKeypointsBriefing(conv: Conversation): string {
  const points = conv.keyPoints ?? deriveKeyPoints(conv);
  const questions = conv.openQuestions ?? [];
  const lines = [
    `[Context from ${conv.platform} — "${conv.title}"]`,
    ``,
    `Summary: ${conv.summary ?? conv.title}`,
    ``,
    `Key decisions made:`,
    ...points.map((p) => `• ${p}`),
  ];
  if (questions.length) {
    lines.push(``, `Open questions:`, ...questions.map((q) => `• ${q}`));
  }
  lines.push(``, `[Continue from this point. Do not re-explain the above decisions.]`);
  return lines.join("\n");
}

function buildSummaryBriefing(conv: Conversation): string {
  const summary = conv.summary ?? deriveSummary(conv);
  const points = conv.keyPoints ?? deriveKeyPoints(conv);
  const questions = conv.openQuestions ?? [];
  const lastMsg = conv.rawMessages.filter((m) => m.role === "assistant").slice(-1)[0];

  const lines = [
    `[Continuing from ${conv.platform} — ${formatDate(conv.createdAt)}]`,
    `Topic: ${conv.title}`,
    ``,
    summary,
    ``,
    `Decisions made:`,
    ...points.map((p) => `• ${p}`),
  ];

  if (questions.length) {
    lines.push(``, `Still open:`, ...questions.map((q) => `• ${q}`));
  }

  if (lastMsg) {
    const snippet = lastMsg.content.replace(/\s+/g, " ").slice(0, 400);
    lines.push(``, `Where we left off:`, snippet + (snippet.length >= 400 ? "…" : ""));
  }

  lines.push(``, `[Acknowledge you've read this and continue from here.]`);
  return lines.join("\n");
}

function buildFullBriefing(conv: Conversation): string {
  const msgs = trimMessages(conv.rawMessages);
  const body = msgs
    .map((m) => {
      if (m.role === "system") return m.content;
      return `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`;
    })
    .join("\n\n");

  return (
    `[Continuing a ${conv.platform} conversation — ${formatDate(conv.createdAt)}]\n\n` +
    body +
    `\n\n[Acknowledge you've read this and continue from where we left off.]`
  );
}

// ── Merged briefing from multiple conversations ─────────────────────────────────

export function buildMergedBriefing(convs: Conversation[], mode: BriefingMode = "full"): string {
  const sections = convs.map((conv, i) => {
    const header = `${"═".repeat(55)}\nContext ${i + 1} of ${convs.length} — ${conv.platform}: ${conv.title}\n${"═".repeat(55)}`;
    const body = buildBriefing(conv, mode === "full" ? "summary" : mode);
    return `${header}\n\n${body}`;
  });

  return (
    `[You have ${convs.length} conversation contexts from different AI sessions. Read all before responding.]\n\n` +
    sections.join("\n\n\n") +
    `\n\n[Acknowledge all ${convs.length} contexts, synthesize the key insights, and continue from here.]`
  );
}

// ── Context Package injection text ─────────────────────────────────────────────

export function buildPackageBriefing(pkg: ContextPackage): string {
  return pkg.document;
}

export function formatPackageDocument(doc: ContextPackageDocument): string {
  const lines: string[] = [
    `╔${"═".repeat(60)}╗`,
    `║  CONTEXT PACKAGE: ${doc.title.slice(0, 40).padEnd(40)} ║`,
    `╚${"═".repeat(60)}╝`,
    ``,
    `SUMMARY`,
    `─`.repeat(40),
    doc.summary,
    ``,
  ];

  if (doc.decisionsMade.length) {
    lines.push(`DECISIONS ALREADY MADE (do not re-discuss)`);
    lines.push(`─`.repeat(40));
    doc.decisionsMade.forEach((d) => lines.push(`• ${d}`));
    lines.push(``);
  }

  if (doc.openQuestions.length) {
    lines.push(`OPEN QUESTIONS (still need solving)`);
    lines.push(`─`.repeat(40));
    doc.openQuestions.forEach((q) => lines.push(`• ${q}`));
    lines.push(``);
  }

  if (doc.codeProduced.length) {
    lines.push(`CODE PRODUCED`);
    lines.push(`─`.repeat(40));
    doc.codeProduced.forEach((c) => {
      lines.push(`[${c.language}] ${c.description}`);
      lines.push(`\`\`\`${c.language}`);
      lines.push(c.snippet);
      lines.push(`\`\`\``);
    });
    lines.push(``);
  }

  lines.push(`WHERE WE LEFT OFF`);
  lines.push(`─`.repeat(40));
  lines.push(doc.whereWeLeftOff);
  lines.push(``);

  if (doc.suggestedNextSteps.length) {
    lines.push(`SUGGESTED NEXT STEPS`);
    lines.push(`─`.repeat(40));
    doc.suggestedNextSteps.forEach((s) => lines.push(`• ${s}`));
    lines.push(``);
  }

  lines.push(`Sources: ${doc.sources.map((s) => `${s.platform} (${s.messageCount} msgs)`).join(", ")}`);
  lines.push(`[Continue from exactly this point. Everything above is already resolved.]`);

  return lines.join("\n");
}

// ── Fallback derivations when AI processing hasn't run yet ─────────────────────

function deriveSummary(conv: Conversation): string {
  const userMsgs = conv.rawMessages.filter((m) => m.role === "user");
  const firstUser = userMsgs[0]?.content.replace(/\s+/g, " ").slice(0, 200) ?? "";
  return `Conversation about: ${firstUser}`;
}

function deriveKeyPoints(conv: Conversation): string[] {
  return conv.rawMessages
    .filter((m) => m.role === "user")
    .slice(0, 3)
    .map((m) => m.content.replace(/\s+/g, " ").slice(0, 120));
}

// ── Utilities ──────────────────────────────────────────────────────────────────

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function platformColor(platform: Platform): string {
  const colors: Record<Platform, string> = {
    Claude:     "#cc785c",
    ChatGPT:    "#19c37d",
    Gemini:     "#4285f4",
    Grok:       "#ffffff",
    DeepSeek:   "#4d6bfe",
    Perplexity: "#20b2aa",
    Unknown:    "#888888",
  };
  return colors[platform] ?? "#888888";
}
