"use client";

import { useState } from "react";

type Platform = "All" | "Claude" | "ChatGPT" | "Gemini" | "Grok" | "DeepSeek" | "Perplexity" | "Unknown";

interface Conversation {
  id: string;
  platform: string;
  title: string;
  message_count: number;
  summary: string | null;
  topics: string[] | null;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface Props {
  conversations: Conversation[];
}

const PLATFORM_META: Record<string, { color: string; bg: string; icon: string }> = {
  Claude:     { color: "#d97706", bg: "rgba(217,119,6,0.12)",    icon: "◆" },
  ChatGPT:    { color: "#10b981", bg: "rgba(16,185,129,0.12)",   icon: "◉" },
  Gemini:     { color: "#6366f1", bg: "rgba(99,102,241,0.12)",   icon: "✦" },
  Grok:       { color: "#e5e7eb", bg: "rgba(229,231,235,0.08)",  icon: "✕" },
  DeepSeek:   { color: "#38bdf8", bg: "rgba(56,189,248,0.12)",   icon: "◈" },
  Perplexity: { color: "#a78bfa", bg: "rgba(167,139,250,0.12)",  icon: "◎" },
  Unknown:    { color: "#6b7280", bg: "rgba(107,114,128,0.10)",  icon: "○" },
};

const ALL_PLATFORMS: Platform[] = ["All", "Claude", "ChatGPT", "Gemini", "Grok", "DeepSeek", "Perplexity"];

function platformMeta(p: string) {
  return PLATFORM_META[p] ?? { color: "#6b7280", bg: "rgba(107,114,128,0.10)", icon: "○" };
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function ConversationsClient({ conversations }: Props) {
  const [active, setActive] = useState<Platform>("All");

  const counts: Record<string, number> = { All: conversations.length };
  for (const c of conversations) {
    counts[c.platform] = (counts[c.platform] ?? 0) + 1;
  }

  const filtered = active === "All"
    ? conversations
    : conversations.filter((c) => c.platform === active);

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#0a0a0a", fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Sidebar */}
      <aside style={{
        width: 220,
        borderRight: "1px solid #1e1e1e",
        padding: "24px 0",
        display: "flex",
        flexDirection: "column",
        gap: 0,
        position: "fixed",
        top: 0,
        left: 0,
        bottom: 0,
      }}>
        <div style={{ padding: "0 20px 28px", borderBottom: "1px solid #1a1a1a" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 18, color: "#d97706" }}>⬡</span>
            <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: "-0.02em", color: "#f5f5f5" }}>LLM Memory</span>
          </div>
        </div>

        <nav style={{ padding: "16px 12px", flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: "#444", letterSpacing: "0.08em", textTransform: "uppercase", padding: "0 8px", marginBottom: 6 }}>
            Navigation
          </div>
          {[
            { label: "Conversations", href: "/conversations", active: true },
            { label: "Packages",      href: "/packages",      active: false },
          ].map((item) => (
            <a
              key={item.href}
              href={item.href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "7px 8px",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: item.active ? 600 : 400,
                color: item.active ? "#f0f0f0" : "#666",
                background: item.active ? "#1a1a1a" : "transparent",
                textDecoration: "none",
                marginBottom: 2,
              }}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </aside>

      {/* Main */}
      <main style={{ marginLeft: 220, flex: 1, padding: "32px 40px", maxWidth: "calc(100vw - 220px)" }}>
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, letterSpacing: "-0.03em", color: "#f5f5f5" }}>
            Conversations
          </h1>
          <p style={{ fontSize: 13, color: "#555", margin: "6px 0 0", lineHeight: 1.5 }}>
            {conversations.length} conversations synced across {Object.keys(counts).filter(k => k !== "All" && counts[k] > 0).length} platforms
          </p>
        </div>

        {/* Platform Tabs */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: "#444", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>
            Sources
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {ALL_PLATFORMS.map((p) => {
              const isActive = active === p;
              const meta = p === "All" ? { color: "#888", bg: "rgba(136,136,136,0.1)", icon: "▤" } : platformMeta(p);
              const count = counts[p] ?? 0;
              if (p !== "All" && count === 0) return null;

              return (
                <button
                  key={p}
                  onClick={() => setActive(p)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    padding: "8px 14px",
                    borderRadius: 8,
                    border: isActive ? `1px solid ${meta.color}40` : "1px solid #1e1e1e",
                    background: isActive ? meta.bg : "#111",
                    color: isActive ? meta.color : "#666",
                    fontSize: 13,
                    fontWeight: isActive ? 600 : 400,
                    cursor: "pointer",
                    transition: "all 0.15s",
                    letterSpacing: "-0.01em",
                  }}
                >
                  <span style={{ fontSize: 11 }}>{meta.icon}</span>
                  <span>{p}</span>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 500,
                    color: isActive ? meta.color : "#444",
                    background: isActive ? `${meta.color}20` : "#1a1a1a",
                    borderRadius: 4,
                    padding: "1px 6px",
                    minWidth: 18,
                    textAlign: "center",
                  }}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Divider */}
        <div style={{ borderTop: "1px solid #1a1a1a", marginBottom: 20 }} />

        {/* Conversation List */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {filtered.map((conv) => {
            const meta = platformMeta(conv.platform);
            return (
              <div
                key={conv.id}
                style={{
                  background: "#0f0f0f",
                  border: "1px solid #1a1a1a",
                  borderRadius: 10,
                  padding: "14px 18px",
                  display: "flex",
                  gap: 14,
                  alignItems: "flex-start",
                  cursor: "pointer",
                  transition: "border-color 0.15s",
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = "#2a2a2a")}
                onMouseLeave={e => (e.currentTarget.style.borderColor = "#1a1a1a")}
              >
                {/* Platform dot */}
                <div style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: meta.bg,
                  border: `1px solid ${meta.color}30`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 13,
                  color: meta.color,
                  flexShrink: 0,
                  marginTop: 1,
                }}>
                  {meta.icon}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "#e5e5e5", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {conv.title}
                  </div>

                  <div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 11, color: "#555", marginBottom: conv.summary ? 8 : 0 }}>
                    <span style={{ color: meta.color, fontWeight: 600 }}>{conv.platform}</span>
                    <span>·</span>
                    <span>{conv.message_count} msgs</span>
                    <span>·</span>
                    <span>{timeAgo(conv.updated_at)}</span>
                    {conv.processed_at && (
                      <>
                        <span>·</span>
                        <span style={{ color: "#10b981", fontSize: 10, fontWeight: 600 }}>✦ AI processed</span>
                      </>
                    )}
                  </div>

                  {conv.summary && (
                    <div style={{ fontSize: 12, color: "#666", lineHeight: 1.5 }}>
                      {conv.summary}
                    </div>
                  )}

                  {conv.topics?.length ? (
                    <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
                      {conv.topics.map((t: string) => (
                        <span key={t} style={{
                          fontSize: 10,
                          background: "#161616",
                          border: "1px solid #222",
                          borderRadius: 4,
                          padding: "2px 7px",
                          color: "#888",
                          fontWeight: 500,
                        }}>
                          {t}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div style={{ textAlign: "center", padding: "80px 0", color: "#444" }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>⬡</div>
              <div style={{ fontSize: 14, fontWeight: 500, color: "#555" }}>No conversations from {active}</div>
              <div style={{ fontSize: 12, marginTop: 6 }}>Install the extension and start chatting.</div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
