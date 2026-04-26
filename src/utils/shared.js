export function makeTitle(messages) {
  const first = messages.find((m) => m.role === "user");
  if (!first) return "Untitled conversation";
  const text = first.content.replace(/\s+/g, " ").trim();
  return text.length > 55 ? text.slice(0, 55) + "…" : text;
}

export function trimMessages(messages) {
  // Collapse large code blocks, truncate long messages
  const cleaned = messages.map((m) => {
    let content = m.content;
    content = content.replace(/```[\s\S]*?```/g, (match) => {
      if (match.length <= 300) return match;
      const lang = match.match(/```(\w*)/)?.[1] || "";
      return `\`\`\`${lang}\n[${match.length} chars of code omitted]\n\`\`\``;
    });
    if (content.length > 700) {
      content = content.slice(0, 700) + `… [+${content.length - 700} chars]`;
    }
    return { ...m, content };
  });

  // If total still over ~5 KB, keep head + tail and skip the middle
  const total = cleaned.reduce((s, m) => s + m.content.length, 0);
  if (total > 5000 && cleaned.length > 6) {
    const omitted = cleaned.length - 6;
    return [
      ...cleaned.slice(0, 2),
      { role: "system", content: `[${omitted} messages omitted for brevity]` },
      ...cleaned.slice(-4),
    ];
  }
  return cleaned;
}

export function buildBriefing(memory) {
  if (memory.isSnippet) {
    const text = memory.messages[0]?.content || "";
    return (
      `[Snippet from ${memory.platform} — ${memory.timestamp}]\n\n` +
      text +
      `\n\n[Reference this snippet in your response.]`
    );
  }
  const msgs = trimMessages(memory.messages);
  const body = msgs
    .map((m) => {
      if (m.role === "system") return m.content;
      return `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`;
    })
    .join("\n\n");
  return (
    `[Continuing a ${memory.platform} conversation — ${memory.timestamp}]\n\n` +
    body +
    `\n\n[Acknowledge you've read this and continue from here.]`
  );
}

export function buildSummary(memory) {
  if (memory.isSnippet) return buildBriefing(memory);

  const msgs = memory.messages;
  const userMsgs      = msgs.filter((m) => m.role === "user");
  const assistantMsgs = msgs.filter((m) => m.role === "assistant");

  const keyPoints = userMsgs
    .slice(0, 3)
    .map((m) => `• ${m.content.replace(/\s+/g, " ").slice(0, 120)}`)
    .join("\n");

  const lastAnswer = assistantMsgs.slice(-1)[0];
  const lastText   = lastAnswer
    ? lastAnswer.content.replace(/\s+/g, " ").slice(0, 400)
    : "";

  return (
    `[Summary — ${memory.platform}, ${memory.timestamp}]\n` +
    `Topic: ${memory.title}\n\n` +
    `What was discussed:\n${keyPoints}\n\n` +
    (lastText
      ? `Last response:\n${lastText}${lastText.length >= 400 ? "…" : ""}\n\n`
      : "") +
    `[Continue this conversation from where it left off.]`
  );
}
