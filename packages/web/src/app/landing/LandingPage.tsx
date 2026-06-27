"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";

const NeuralScene = dynamic(() => import("./NeuralScene"), { ssr: false });

const PLATFORMS = [
  { name: "Claude", color: "#f59e0b", desc: "Anthropic" },
  { name: "ChatGPT", color: "#10b981", desc: "OpenAI" },
  { name: "Gemini", color: "#6366f1", desc: "Google" },
  { name: "Grok", color: "#6b7280", desc: "xAI" },
  { name: "DeepSeek", color: "#0ea5e9", desc: "DeepSeek" },
  { name: "Perplexity", color: "#8b5cf6", desc: "Perplexity AI" },
  { name: "Copilot", color: "#3b82f6", desc: "Microsoft" },
  { name: "Meta AI", color: "#60a5fa", desc: "Meta" },
  { name: "Mistral", color: "#f97316", desc: "Mistral AI" },
  { name: "Poe", color: "#a855f7", desc: "Quora" },
];

const FEATURES = [
  {
    title: "Auto-Capture Conversations",
    description: "The extension silently saves your conversations every 30 seconds as you chat. No buttons to click, no manual exports. Just talk to any AI and your knowledge is preserved automatically.",
    details: ["Saves every 30s", "Zero-click capture", "Full message history", "Background operation"],
    icon: "⚡",
    color: "#f59e0b",
  },
  {
    title: "Cross-Platform Memory",
    description: "Start a coding session in Claude, continue debugging in ChatGPT, then summarize in Gemini — without ever re-explaining your project. Your context follows you across every platform.",
    details: ["10 platforms", "Unified history", "Seamless switching", "Platform-agnostic"],
    icon: "🧠",
    color: "#7c3aed",
  },
  {
    title: "Smart Context Injection",
    description: "When you start a new conversation, Stash offers to inject relevant context from your past chats directly into the input field. The AI gets your full background instantly.",
    details: ["One-click inject", "Auto-detected context", "Direct input injection", "Clipboard fallback"],
    icon: "💡",
    color: "#06b6d4",
  },
  {
    title: "RAG-Powered Retrieval",
    description: "Powered by Voyage AI embeddings and pgvector, the extension performs semantic search across all your conversations to find the most relevant pieces of your past discussions.",
    details: ["Vector search", "AI embeddings", "Smart reranking", "Semantic matching"],
    icon: "🔍",
    color: "#10b981",
  },
  {
    title: "Context Packages",
    description: "Bundle multiple related conversations into a single reusable context document. Perfect for ongoing projects — generate comprehensive briefings you can inject anywhere.",
    details: ["Bundle chats", "Reusable docs", "AI summaries", "Project context"],
    icon: "📦",
    color: "#ec4899",
  },
  {
    title: "Offline-First Architecture",
    description: "Everything is stored locally in IndexedDB first. Your data never leaves your browser until you explicitly sync. Works perfectly offline — your data, your control.",
    details: ["Local-first storage", "Sync when ready", "Works offline", "Privacy by design"],
    icon: "🛡️",
    color: "#6366f1",
  },
];

const TYPING_LINES = [
  "How do I optimize this React component?",
  "Explain the database migration strategy",
  "Debug this authentication flow",
  "Write unit tests for the payment module",
];

function useScrollReveal(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); }, { threshold });
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, visible };
}

function AnimatedCounter({ target, duration = 2000, suffix = "" }: { target: number; duration?: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  const { ref, visible } = useScrollReveal(0.3);
  useEffect(() => {
    if (!visible) return;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(eased * target));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [visible, target, duration]);
  return <span ref={ref}>{count}{suffix}</span>;
}

function TypingDemo() {
  const [lineIdx, setLineIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const line = TYPING_LINES[lineIdx];
    if (!deleting && charIdx < line.length) {
      const t = setTimeout(() => setCharIdx(c => c + 1), 40 + Math.random() * 40);
      return () => clearTimeout(t);
    }
    if (!deleting && charIdx === line.length) {
      const t = setTimeout(() => setDeleting(true), 2000);
      return () => clearTimeout(t);
    }
    if (deleting && charIdx > 0) {
      const t = setTimeout(() => setCharIdx(c => c - 1), 20);
      return () => clearTimeout(t);
    }
    if (deleting && charIdx === 0) {
      setDeleting(false);
      setLineIdx(i => (i + 1) % TYPING_LINES.length);
    }
  }, [charIdx, deleting, lineIdx]);

  return (
    <span style={{ color: "#e5e7eb" }}>
      {TYPING_LINES[lineIdx].slice(0, charIdx)}
      <span style={{ animation: "blink 1s step-end infinite", color: "#7c3aed" }}>|</span>
    </span>
  );
}

function PlatformOrbit() {
  const { ref, visible } = useScrollReveal(0.1);
  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <div ref={ref} style={{ position: "relative", width: 480, height: 480, margin: "0 auto" }}>
      {/* Orbit rings */}
      {[160, 220].map((r, ri) => (
        <div key={ri} style={{
          position: "absolute",
          top: "50%", left: "50%",
          width: r * 2, height: r * 2,
          borderRadius: "50%",
          border: "1px solid rgba(124,58,237,0.1)",
          transform: "translate(-50%,-50%)",
          animation: visible ? `spinRing ${40 + ri * 20}s linear infinite${ri % 2 ? " reverse" : ""}` : "none",
        }} />
      ))}

      {/* Center hub */}
      <div style={{
        position: "absolute",
        top: "50%", left: "50%",
        transform: "translate(-50%,-50%)",
        width: 90, height: 90,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(124,58,237,0.15), rgba(124,58,237,0.03))",
        border: "1px solid rgba(124,58,237,0.25)",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 0 60px rgba(124,58,237,0.15)",
        animation: visible ? "pulseGlow 3s ease-in-out infinite" : "none",
        zIndex: 2,
      }}>
        <span style={{ fontSize: 16, fontWeight: 800, color: "#a78bfa", textAlign: "center", letterSpacing: "-0.03em" }}>
          Stash
        </span>
      </div>

      {/* Platform nodes */}
      {PLATFORMS.map((p, i) => {
        const ring = i < 5 ? 0 : 1;
        const radius = ring === 0 ? 160 : 220;
        const indexInRing = ring === 0 ? i : i - 5;
        const countInRing = 5;
        const angle = (indexInRing / countInRing) * Math.PI * 2 - Math.PI / 2;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        const isHovered = hovered === i;

        return (
          <div
            key={p.name}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            style={{
              position: "absolute",
              top: "50%", left: "50%",
              transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(${isHovered ? 1.2 : 1})`,
              opacity: visible ? 1 : 0,
              transition: `opacity 0.5s ${i * 0.08}s, transform 0.3s`,
              zIndex: isHovered ? 10 : 1,
              cursor: "default",
            }}
          >
            {/* Connection line to center */}
            <svg style={{
              position: "absolute",
              top: "50%", left: "50%",
              width: 1, height: 1,
              overflow: "visible",
              pointerEvents: "none",
              zIndex: -1,
            }}>
              <line
                x1={0} y1={0}
                x2={-x} y2={-y}
                stroke={p.color}
                strokeOpacity={isHovered ? 0.4 : 0.08}
                strokeWidth={isHovered ? 2 : 1}
                strokeDasharray={isHovered ? "none" : "4 4"}
                style={{ transition: "all 0.3s" }}
              />
              {isHovered && (
                <circle r={3} fill={p.color} opacity={0.8}>
                  <animateMotion dur="1.5s" repeatCount="indefinite"
                    path={`M0,0 L${-x},${-y}`} />
                </circle>
              )}
            </svg>

            {/* Node */}
            <div style={{
              width: isHovered ? 72 : 56,
              height: isHovered ? 72 : 56,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${p.color}25, ${p.color}08)`,
              border: `2px solid ${p.color}${isHovered ? "80" : "40"}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              flexDirection: "column",
              boxShadow: isHovered ? `0 0 30px ${p.color}40` : `0 0 15px ${p.color}15`,
              transition: "all 0.3s",
              animation: visible ? `floatNode ${3 + (i % 3)}s ease-in-out ${i * 0.2}s infinite` : "none",
            }}>
              <span style={{ fontSize: isHovered ? 11 : 10, fontWeight: 700, color: p.color, transition: "all 0.3s" }}>
                {p.name.length > 7 ? p.name.slice(0, 6) + "…" : p.name}
              </span>
            </div>

            {/* Tooltip */}
            {isHovered && (
              <div style={{
                position: "absolute",
                bottom: "calc(100% + 8px)",
                left: "50%",
                transform: "translateX(-50%)",
                padding: "6px 12px",
                borderRadius: 8,
                background: "rgba(15,15,15,0.95)",
                border: `1px solid ${p.color}40`,
                whiteSpace: "nowrap",
                animation: "fadeInUp 0.2s ease-out",
                zIndex: 20,
              }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: p.color }}>{p.name}</div>
                <div style={{ fontSize: 10, color: "#9ca3af" }}>{p.desc}</div>
              </div>
            )}
          </div>
        );
      })}

      {/* Animated pulse rings */}
      {[0, 1, 2].map(i => (
        <div key={`pulse-${i}`} style={{
          position: "absolute",
          top: "50%", left: "50%",
          width: 90, height: 90,
          borderRadius: "50%",
          border: "1px solid rgba(124,58,237,0.15)",
          transform: "translate(-50%,-50%)",
          animation: visible ? `expandRing 3s ease-out ${i * 1}s infinite` : "none",
          pointerEvents: "none",
        }} />
      ))}
    </div>
  );
}

export default function LandingPage() {
  const [scrollY, setScrollY] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const platformSection = useScrollReveal(0.1);
  const featuresHeader = useScrollReveal(0.2);

  useEffect(() => {
    setMounted(true);
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY });
  }, []);

  return (
    <div style={{ minHeight: "100vh", overflow: "hidden" }} onMouseMove={handleMouseMove}>

      {/* ── NAVBAR ── */}
      <nav style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        padding: "16px 32px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: scrollY > 50 ? "rgba(10,10,10,0.85)" : "transparent",
        backdropFilter: scrollY > 50 ? "blur(20px) saturate(180%)" : "none",
        WebkitBackdropFilter: scrollY > 50 ? "blur(20px) saturate(180%)" : "none",
        borderBottom: scrollY > 50 ? "1px solid rgba(255,255,255,0.06)" : "1px solid transparent",
        transition: "all 0.4s ease",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 10,
            background: "linear-gradient(135deg, #7c3aed, #06b6d4)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, fontWeight: 800, color: "#fff",
          }}>S</div>
          <span style={{ fontSize: 18, fontWeight: 700, color: "#f5f5f5", letterSpacing: "-0.03em" }}>Stash</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <a href="#features" style={{ fontSize: 14, color: "#9ca3af", textDecoration: "none" }}>Features</a>
          <a href="/auth" style={{
            fontSize: 13, color: "#a78bfa", textDecoration: "none",
            padding: "8px 18px", borderRadius: 8,
            border: "1px solid rgba(124,58,237,0.3)",
            background: "rgba(124,58,237,0.08)",
            fontWeight: 500,
          }}>Sign In</a>
        </div>
      </nav>

      {/* Cursor glow */}
      <div style={{
        position: "fixed",
        left: mousePos.x - 200,
        top: mousePos.y - 200,
        width: 400, height: 400,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(124,58,237,0.04), transparent 70%)",
        pointerEvents: "none",
        zIndex: 0,
        transition: "left 0.3s ease-out, top 0.3s ease-out",
      }} />

      {/* ── HERO ── */}
      <section style={{ position: "relative", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <NeuralScene />

        <div style={{
          position: "absolute", inset: 0,
          background: "radial-gradient(ellipse at center, transparent 0%, rgba(10,10,10,0.4) 50%, rgba(10,10,10,0.9) 100%)",
          zIndex: 1,
        }} />

        <div style={{
          position: "relative", zIndex: 2, padding: "80px 24px 60px",
          maxWidth: 1200, width: "100%", margin: "0 auto",
          display: "grid", gridTemplateColumns: "1fr 1fr", alignItems: "center", gap: 48,
        }} className="hero-grid">

          {/* Left: text content */}
          <div style={{
            opacity: mounted ? 1 : 0,
            transform: mounted ? "translateY(0)" : "translateY(40px)",
            transition: "all 1.2s cubic-bezier(0.16, 1, 0.3, 1)",
          }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "6px 16px", borderRadius: 20,
              background: "rgba(124,58,237,0.1)", border: "1px solid rgba(124,58,237,0.3)",
              marginBottom: 24, fontSize: 14, color: "#a78bfa",
              animation: mounted ? "fadeInUp 0.8s ease-out 0.3s both" : "none",
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#7c3aed", animation: "pulse 2s infinite" }} />
              Chrome Extension &mdash; 10 LLM Platforms
            </div>

            <h1 style={{
              fontSize: "clamp(36px, 5vw, 64px)", fontWeight: 800, lineHeight: 1.05, margin: "0 0 24px",
              letterSpacing: "-0.03em",
              animation: mounted ? "fadeInUp 0.8s ease-out 0.5s both" : "none",
            }}>
              <span style={{
                background: "linear-gradient(135deg, #fff 0%, #d1d5db 100%)",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
              }}>
                Never Lose an{" "}
              </span>
              <br />
              <span style={{
                background: "linear-gradient(135deg, #7c3aed, #06b6d4, #7c3aed)",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
                animation: "gradientShift 4s ease infinite",
                backgroundSize: "300% 300%",
              }}>
                AI Conversation
              </span>
              <br />
              <span style={{
                background: "linear-gradient(135deg, #fff 0%, #d1d5db 100%)",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
              }}>
                Again.
              </span>
            </h1>

            <p style={{
              fontSize: "clamp(15px, 2vw, 18px)", color: "#9ca3af", lineHeight: 1.6,
              margin: "0 0 32px", maxWidth: 500,
              animation: mounted ? "fadeInUp 0.8s ease-out 0.7s both" : "none",
            }}>
              Stash captures every conversation across Claude, ChatGPT, Gemini, and more &mdash;
              then gives you the power to bring that context into any new chat.
            </p>

            {/* Mock input with typing */}
            <div style={{
              maxWidth: 460, margin: "0 0 32px", padding: "14px 20px",
              borderRadius: 12, background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              textAlign: "left", fontSize: 14, fontFamily: "monospace",
              animation: mounted ? "fadeInUp 0.8s ease-out 0.9s both" : "none",
            }}>
              <span style={{ color: "#6b7280", marginRight: 8 }}>&gt;</span>
              <TypingDemo />
            </div>

            <div style={{
              display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center",
              animation: mounted ? "fadeInUp 0.8s ease-out 1.1s both" : "none",
            }}>
              <div className="coming-soon-btn" style={{
                position: "relative", borderRadius: 14, padding: 1,
                background: "linear-gradient(135deg, #7c3aed, #06b6d4, #7c3aed)",
                backgroundSize: "200% 200%",
                animation: "gradientShift 3s ease infinite",
              }}>
                <span style={{
                  display: "inline-block",
                  padding: "13px 32px", borderRadius: 13,
                  background: "rgba(10,10,10,0.9)",
                  color: "#a78bfa", fontSize: 16, fontWeight: 600,
                  cursor: "default", letterSpacing: "-0.01em",
                }}>
                  Coming Soon
                </span>
              </div>
              <a href="#features" style={{
                padding: "14px 32px", borderRadius: 14,
                background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                color: "#d1d5db", fontSize: 16, fontWeight: 500, textDecoration: "none",
              }}>
                Learn More
              </a>
            </div>
          </div>

          {/* Right: extension preview */}
          <div style={{
            display: "flex", justifyContent: "center", alignItems: "center",
            position: "relative",
            opacity: mounted ? 1 : 0,
            transform: mounted ? "translateY(0) scale(1)" : "translateY(30px) scale(0.95)",
            transition: "all 1.2s cubic-bezier(0.16, 1, 0.3, 1) 0.4s",
          }}>
            {/* Glow behind image */}
            <div style={{
              position: "absolute",
              width: "80%", height: "80%",
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(124,58,237,0.15), rgba(6,182,212,0.05), transparent 70%)",
              animation: "pulseGlow 4s ease-in-out infinite",
              filter: "blur(40px)",
            }} />

            {/* Extension screenshot */}
            <div style={{
              position: "relative",
              borderRadius: 20,
              overflow: "hidden",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 25px 80px rgba(0,0,0,0.5), 0 0 60px rgba(124,58,237,0.1)",
              animation: mounted ? "heroFloat 5s ease-in-out infinite" : "none",
              maxWidth: 360,
            }}>
              {/* Top gradient reflection */}
              <div style={{
                position: "absolute", top: 0, left: 0, right: 0, height: "30%",
                background: "linear-gradient(to bottom, rgba(255,255,255,0.03), transparent)",
                zIndex: 2, pointerEvents: "none",
              }} />

              <img
                src="/extension-preview.png"
                alt="Stash Extension"
                style={{
                  display: "block", width: "100%", height: "auto",
                  opacity: 0.85,
                }}
              />

              {/* Bottom fade */}
              <div style={{
                position: "absolute", bottom: 0, left: 0, right: 0, height: "20%",
                background: "linear-gradient(to top, rgba(10,10,10,0.8), transparent)",
                zIndex: 2, pointerEvents: "none",
              }} />
            </div>
          </div>
        </div>

        {/* Scroll indicator */}
        <div style={{
          position: "absolute", bottom: 40, left: "50%", transform: "translateX(-50%)",
          zIndex: 2, opacity: scrollY > 100 ? 0 : 0.6, transition: "opacity 0.3s",
        }}>
          <div style={{
            width: 24, height: 40, borderRadius: 12,
            border: "2px solid rgba(255,255,255,0.3)",
            display: "flex", justifyContent: "center", paddingTop: 8,
          }}>
            <div style={{
              width: 3, height: 8, borderRadius: 2,
              background: "rgba(255,255,255,0.5)", animation: "scrollBounce 2s infinite",
            }} />
          </div>
        </div>
      </section>

      {/* ── STATS BAR ── */}
      <section style={{
        padding: "48px 24px",
        borderTop: "1px solid rgba(255,255,255,0.05)",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        background: "rgba(255,255,255,0.01)",
      }}>
        <div style={{
          maxWidth: 900, margin: "0 auto",
          display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 32, textAlign: "center",
        }}>
          {[
            { value: 10, suffix: "", label: "LLM Platforms" },
            { value: 30, suffix: "s", label: "Auto-Save Interval" },
            { value: 100, suffix: "%", label: "Offline Capable" },
            { value: 0, suffix: "", label: "Config Required", display: "Zero" },
          ].map((stat) => (
            <div key={stat.label}>
              <div style={{
                fontSize: 36, fontWeight: 700, lineHeight: 1,
                background: "linear-gradient(135deg, #7c3aed, #06b6d4)",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
              }}>
                {stat.display || <AnimatedCounter target={stat.value} suffix={stat.suffix} />}
              </div>
              <div style={{ fontSize: 14, color: "#6b7280", marginTop: 8 }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── PLATFORMS ORBIT ── */}
      <section ref={platformSection.ref} style={{
        padding: "120px 24px", textAlign: "center", position: "relative", overflow: "hidden",
      }}>
        {/* Animated background mesh */}
        <div style={{
          position: "absolute", inset: 0, opacity: 0.4,
          backgroundImage: `radial-gradient(rgba(124,58,237,0.08) 1px, transparent 1px)`,
          backgroundSize: "40px 40px",
          animation: platformSection.visible ? "meshDrift 20s linear infinite" : "none",
        }} />

        <div style={{
          opacity: platformSection.visible ? 1 : 0,
          transform: platformSection.visible ? "translateY(0)" : "translateY(40px)",
          transition: "all 0.8s cubic-bezier(0.16,1,0.3,1)",
        }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "6px 14px", borderRadius: 20,
            background: "rgba(124,58,237,0.08)", border: "1px solid rgba(124,58,237,0.2)",
            marginBottom: 20, fontSize: 13, color: "#a78bfa", fontWeight: 500,
          }}>
            Platform Support
          </div>
          <h2 style={{ fontSize: "clamp(28px, 5vw, 42px)", fontWeight: 700, marginBottom: 12 }}>
            Works With{" "}
            <span style={{
              background: "linear-gradient(135deg, #7c3aed, #06b6d4)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
            }}>Every Major LLM</span>
          </h2>
          <p style={{ color: "#9ca3af", marginBottom: 16, fontSize: 18 }}>
            One extension. All your AI conversations captured automatically.
          </p>
          <p style={{ color: "#6b7280", marginBottom: 60, fontSize: 14 }}>
            Auto-detects which platform you&#39;re on. No setup, no configuration.
          </p>
        </div>

        <PlatformOrbit />
      </section>

      {/* ── FEATURES SHOWCASE ── */}
      <section id="features" style={{ padding: "120px 0 0", position: "relative" }}>
        <div style={{
          position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
          width: "50%", height: 1,
          background: "linear-gradient(90deg, transparent, rgba(6,182,212,0.3), transparent)",
        }} />

        <div ref={featuresHeader.ref} style={{
          textAlign: "center", marginBottom: 80, padding: "0 24px",
          opacity: featuresHeader.visible ? 1 : 0,
          transform: featuresHeader.visible ? "translateY(0)" : "translateY(40px)",
          transition: "all 0.8s cubic-bezier(0.16,1,0.3,1)",
        }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "6px 14px", borderRadius: 20,
            background: "rgba(6,182,212,0.08)", border: "1px solid rgba(6,182,212,0.2)",
            marginBottom: 20, fontSize: 13, color: "#06b6d4", fontWeight: 500,
          }}>
            Extension Features
          </div>
          <h2 style={{ fontSize: "clamp(28px, 5vw, 42px)", fontWeight: 700, marginBottom: 16 }}>
            How It{" "}
            <span style={{
              background: "linear-gradient(135deg, #06b6d4, #7c3aed)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
            }}>Works</span>
          </h2>
          <p style={{ color: "#9ca3af", fontSize: 18, maxWidth: 600, margin: "0 auto", lineHeight: 1.6 }}>
            From automatic capture to intelligent retrieval &mdash; here&#39;s everything the extension does for you.
          </p>
        </div>

        {/* Full-width feature rows */}
        {FEATURES.map((feature, i) => (
          <FeatureShowcaseRow key={feature.title} feature={feature} index={i} />
        ))}
      </section>

      {/* ── CTA ── */}
      <CtaSection />

      {/* Footer */}
      <footer style={{
        padding: "48px 24px", textAlign: "center",
        borderTop: "1px solid rgba(255,255,255,0.05)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 12 }}>
          <div style={{
            width: 24, height: 24, borderRadius: 7,
            background: "linear-gradient(135deg, #7c3aed, #06b6d4)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 800, color: "#fff",
          }}>S</div>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#e5e7eb", letterSpacing: "-0.02em" }}>Stash</span>
        </div>
        <p style={{ margin: 0, color: "#4b5563", fontSize: 13 }}>Your conversations, your context, your control.</p>
      </footer>

      {/* ── GLOBAL CSS ── */}
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
        @keyframes blink { 50%{opacity:0} }
        @keyframes scrollBounce { 0%,100%{transform:translateY(0);opacity:1} 50%{transform:translateY(6px);opacity:0.3} }

        @keyframes fadeInUp {
          from { opacity:0; transform:translateY(25px) }
          to { opacity:1; transform:translateY(0) }
        }
        @keyframes fadeInLeft {
          from { opacity:0; transform:translateX(-40px) }
          to { opacity:1; transform:translateX(0) }
        }
        @keyframes fadeInRight {
          from { opacity:0; transform:translateX(40px) }
          to { opacity:1; transform:translateX(0) }
        }

        @keyframes floatNode {
          0%,100% { transform:translate(calc(-50% + var(--x)), calc(-50% + var(--y))) }
          50% { transform:translate(calc(-50% + var(--x)), calc(-50% + var(--y) - 5px)) }
        }

        @keyframes spinRing {
          to { transform:translate(-50%,-50%) rotate(360deg) }
        }
        @keyframes pulseGlow {
          0%,100% { box-shadow:0 0 60px rgba(124,58,237,0.15) }
          50% { box-shadow:0 0 80px rgba(124,58,237,0.3) }
        }
        @keyframes expandRing {
          0% { width:90px;height:90px;opacity:0.4 }
          100% { width:350px;height:350px;opacity:0 }
        }

        @keyframes heroFloat {
          0%,100% { transform: translateY(0) rotate(0deg) }
          50% { transform: translateY(-12px) rotate(0.5deg) }
        }

        @keyframes meshDrift {
          to { background-position:40px 40px }
        }

        @keyframes gradientShift {
          0%,100% { background-position:0% 50% }
          50% { background-position:100% 50% }
        }

        @keyframes slideInDetail {
          from { opacity:0; transform:translateY(8px) }
          to { opacity:1; transform:translateY(0) }
        }

        @keyframes scanLine {
          0% { background-position: 0% 0% }
          100% { background-position: 0% 200% }
        }

        @keyframes orbitParticle {
          to { transform: rotate(360deg) }
        }

        .cta-primary::after {
          content:'';
          position:absolute; inset:0;
          background:linear-gradient(135deg, transparent 40%, rgba(255,255,255,0.1) 50%, transparent 60%);
          background-size:200% 100%;
          animation:ctaShine 3s ease-in-out infinite;
        }
        @keyframes ctaShine {
          0% { background-position:200% 0 }
          100% { background-position:-200% 0 }
        }

        nav a:not([style*="border"]):hover { color: #e5e7eb !important; }

        .coming-soon-btn:hover span {
          background: rgba(10,10,10,0.7) !important;
          color: #c4b5fd !important;
        }

        @media (max-width: 768px) {
          .hero-grid { grid-template-columns: 1fr !important; text-align: center; }
          .feature-row { grid-template-columns: 1fr !important; gap: 32px !important; }
          .feature-row > * { order: 0 !important; }
          .cta-inner { grid-template-columns: 1fr !important; }
          nav { padding: 12px 16px !important; }
        }
      `}</style>
    </div>
  );
}

function FeatureMockup({ feature, index, visible }: { feature: typeof FEATURES[number]; index: number; visible: boolean }) {
  if (index === 0) {
    return (
      <div style={{ position: "relative", width: "100%", maxWidth: 380 }}>
        <div style={{
          background: "rgba(15,15,15,0.9)", borderRadius: 16,
          border: "1px solid rgba(255,255,255,0.08)", overflow: "hidden",
          boxShadow: `0 20px 60px rgba(0,0,0,0.4), 0 0 40px ${feature.color}10`,
        }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444" }} />
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#f59e0b" }} />
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e" }} />
            <span style={{ fontSize: 11, color: "#6b7280", marginLeft: 8 }}>claude.ai</span>
          </div>
          {[
            { role: "You", text: "How do I optimize this React component?", delay: 0 },
            { role: "Claude", text: "Here are 3 key optimizations for your component...", delay: 0.3 },
            { role: "You", text: "Can you show me with useMemo?", delay: 0.6 },
          ].map((msg, mi) => (
            <div key={mi} style={{
              padding: "12px 16px",
              borderBottom: "1px solid rgba(255,255,255,0.03)",
              opacity: visible ? 1 : 0,
              animation: visible ? `slideInDetail 0.5s ease-out ${0.4 + msg.delay}s both` : "none",
            }}>
              <div style={{ fontSize: 10, color: msg.role === "You" ? "#06b6d4" : feature.color, fontWeight: 600, marginBottom: 4 }}>{msg.role}</div>
              <div style={{ fontSize: 13, color: "#d1d5db", lineHeight: 1.4 }}>{msg.text}</div>
            </div>
          ))}
          <div style={{
            padding: "10px 16px", display: "flex", alignItems: "center", gap: 8,
            background: "rgba(245,158,11,0.05)",
            borderTop: "1px solid rgba(245,158,11,0.1)",
          }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: feature.color, animation: "pulse 1.5s infinite" }} />
            <span style={{ fontSize: 11, color: feature.color, fontWeight: 500 }}>Auto-saving...</span>
            <div style={{ marginLeft: "auto", width: 60, height: 3, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
              <div style={{
                width: visible ? "100%" : "0%", height: "100%",
                background: feature.color, borderRadius: 2,
                transition: "width 2s ease-in-out",
              }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (index === 1) {
    const platforms = [
      { name: "Claude", color: "#f59e0b", msgs: 12 },
      { name: "ChatGPT", color: "#10b981", msgs: 8 },
      { name: "Gemini", color: "#6366f1", msgs: 5 },
    ];
    return (
      <div style={{ display: "flex", gap: 12, width: "100%", maxWidth: 380 }}>
        {platforms.map((p, pi) => (
          <div key={p.name} style={{
            flex: 1, padding: "20px 14px", borderRadius: 14,
            background: `linear-gradient(135deg, ${p.color}08, ${p.color}03)`,
            border: `1px solid ${p.color}20`,
            textAlign: "center",
            opacity: visible ? 1 : 0,
            animation: visible ? `fadeInUp 0.6s ease-out ${0.3 + pi * 0.15}s both` : "none",
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: "50%", margin: "0 auto 10px",
              background: `${p.color}15`, border: `1px solid ${p.color}30`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: p.color }} />
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: p.color, marginBottom: 4 }}>{p.name}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#fff" }}>{p.msgs}</div>
            <div style={{ fontSize: 10, color: "#6b7280" }}>conversations</div>
            <div style={{
              marginTop: 10, height: 3, borderRadius: 2,
              background: "rgba(255,255,255,0.06)", overflow: "hidden",
            }}>
              <div style={{
                width: visible ? `${(p.msgs / 12) * 100}%` : "0%", height: "100%",
                background: p.color, borderRadius: 2,
                transition: "width 1.5s ease-out",
                transitionDelay: `${0.6 + pi * 0.2}s`,
              }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (index === 2) {
    return (
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{
          background: "rgba(15,15,15,0.9)", borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.08)", overflow: "hidden",
          boxShadow: `0 20px 60px rgba(0,0,0,0.4)`,
        }}>
          <div style={{
            padding: "14px 16px",
            background: `linear-gradient(90deg, ${feature.color}10, transparent)`,
            borderBottom: `1px solid ${feature.color}15`,
            display: "flex", alignItems: "center", gap: 10,
            opacity: visible ? 1 : 0,
            animation: visible ? "fadeInUp 0.5s ease-out 0.3s both" : "none",
          }}>
            <div style={{ fontSize: 18 }}>💡</div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>Context Available</div>
              <div style={{ fontSize: 10, color: "#9ca3af" }}>3 related conversations found</div>
            </div>
            <div style={{
              marginLeft: "auto", padding: "5px 14px", borderRadius: 8,
              background: feature.color, fontSize: 11, fontWeight: 600, color: "#fff",
              animation: visible ? "pulseGlow 2s ease-in-out infinite" : "none",
            }}>
              Inject
            </div>
          </div>
          {["React optimization techniques", "Component performance audit", "useMemo best practices"].map((item, ii) => (
            <div key={item} style={{
              padding: "10px 16px",
              borderBottom: "1px solid rgba(255,255,255,0.03)",
              display: "flex", alignItems: "center", gap: 10,
              opacity: visible ? 1 : 0,
              animation: visible ? `slideInDetail 0.4s ease-out ${0.5 + ii * 0.12}s both` : "none",
            }}>
              <div style={{ width: 4, height: 4, borderRadius: "50%", background: feature.color, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: "#d1d5db" }}>{item}</span>
              <span style={{ marginLeft: "auto", fontSize: 10, color: "#6b7280" }}>86%</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (index === 3) {
    return (
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{
          background: "rgba(15,15,15,0.9)", borderRadius: 14, padding: 20,
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: `0 20px 60px rgba(0,0,0,0.4)`,
        }}>
          <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, marginBottom: 14 }}>Semantic Search</div>
          <div style={{
            padding: "10px 14px", borderRadius: 10,
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
            fontSize: 13, color: "#e5e7eb", marginBottom: 16,
            opacity: visible ? 1 : 0,
            animation: visible ? "fadeInUp 0.5s ease-out 0.3s both" : "none",
          }}>
            &quot;React performance optimization&quot;
          </div>
          {[
            { score: 0.94, title: "useMemo deep dive", platform: "Claude" },
            { score: 0.87, title: "Virtual DOM reconciliation", platform: "ChatGPT" },
            { score: 0.81, title: "Code splitting strategies", platform: "Gemini" },
          ].map((r, ri) => (
            <div key={r.title} style={{
              display: "flex", alignItems: "center", gap: 12, padding: "10px 0",
              borderBottom: "1px solid rgba(255,255,255,0.04)",
              opacity: visible ? 1 : 0,
              animation: visible ? `slideInDetail 0.4s ease-out ${0.5 + ri * 0.15}s both` : "none",
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: `${feature.color}15`, border: `1px solid ${feature.color}20`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 700, color: feature.color,
              }}>
                {Math.round(r.score * 100)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: "#e5e7eb", fontWeight: 500 }}>{r.title}</div>
                <div style={{ fontSize: 10, color: "#6b7280" }}>from {r.platform}</div>
              </div>
              <div style={{
                width: 50, height: 4, borderRadius: 2,
                background: "rgba(255,255,255,0.06)", overflow: "hidden",
              }}>
                <div style={{
                  width: visible ? `${r.score * 100}%` : "0%", height: "100%",
                  background: feature.color, borderRadius: 2,
                  transition: "width 1s ease-out",
                  transitionDelay: `${0.8 + ri * 0.15}s`,
                }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (index === 4) {
    return (
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{
          background: "rgba(15,15,15,0.9)", borderRadius: 14, padding: 20,
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: `0 20px 60px rgba(0,0,0,0.4)`,
        }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 10, marginBottom: 16,
            opacity: visible ? 1 : 0,
            animation: visible ? "fadeInUp 0.5s ease-out 0.3s both" : "none",
          }}>
            <div style={{ fontSize: 24 }}>📦</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>React Performance</div>
              <div style={{ fontSize: 11, color: "#6b7280" }}>Context Package &middot; 4 conversations</div>
            </div>
          </div>
          {["Optimization techniques", "Component lifecycle", "Memoization patterns", "Bundle analysis"].map((item, ii) => (
            <div key={item} style={{
              display: "flex", alignItems: "center", gap: 8, padding: "8px 0",
              opacity: visible ? 1 : 0,
              animation: visible ? `slideInDetail 0.4s ease-out ${0.5 + ii * 0.1}s both` : "none",
            }}>
              <div style={{
                width: 20, height: 20, borderRadius: 6,
                background: `${feature.color}15`, border: `1px solid ${feature.color}20`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 10, color: feature.color,
              }}>
                ✓
              </div>
              <span style={{ fontSize: 13, color: "#d1d5db" }}>{item}</span>
            </div>
          ))}
          <div style={{
            marginTop: 14, padding: "10px 14px", borderRadius: 10,
            background: `${feature.color}10`, border: `1px solid ${feature.color}20`,
            textAlign: "center", fontSize: 12, fontWeight: 600, color: feature.color,
            opacity: visible ? 1 : 0,
            animation: visible ? "fadeInUp 0.5s ease-out 1s both" : "none",
          }}>
            Generate Briefing
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: "100%", maxWidth: 380 }}>
      <div style={{
        background: "rgba(15,15,15,0.9)", borderRadius: 14, padding: 20,
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: `0 20px 60px rgba(0,0,0,0.4)`,
      }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16,
          opacity: visible ? 1 : 0,
          animation: visible ? "fadeInUp 0.5s ease-out 0.3s both" : "none",
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>Storage Status</div>
          <div style={{ padding: "3px 10px", borderRadius: 6, background: "#22c55e20", fontSize: 10, color: "#22c55e", fontWeight: 600 }}>Offline Ready</div>
        </div>
        {[
          { label: "Local (IndexedDB)", value: "24 conversations", bar: 0.6, color: feature.color },
          { label: "Sync Queue", value: "3 pending", bar: 0.15, color: "#f59e0b" },
          { label: "Cloud (Supabase)", value: "21 synced", bar: 0.52, color: "#22c55e" },
        ].map((item, ii) => (
          <div key={item.label} style={{
            marginBottom: 14,
            opacity: visible ? 1 : 0,
            animation: visible ? `slideInDetail 0.4s ease-out ${0.5 + ii * 0.15}s both` : "none",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: "#9ca3af" }}>{item.label}</span>
              <span style={{ fontSize: 12, color: "#d1d5db", fontWeight: 500 }}>{item.value}</span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
              <div style={{
                width: visible ? `${item.bar * 100}%` : "0%", height: "100%",
                background: `linear-gradient(90deg, ${item.color}, ${item.color}80)`,
                borderRadius: 3, transition: "width 1.2s ease-out",
                transitionDelay: `${0.8 + ii * 0.2}s`,
              }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FeatureShowcaseRow({ feature, index }: { feature: typeof FEATURES[number]; index: number }) {
  const { ref, visible } = useScrollReveal(0.15);
  const isEven = index % 2 === 0;

  return (
    <div ref={ref} style={{
      padding: "60px 24px",
      position: "relative",
      overflow: "hidden",
      borderBottom: "1px solid rgba(255,255,255,0.03)",
    }}>
      {/* Background accent */}
      <div style={{
        position: "absolute", inset: 0,
        background: `radial-gradient(ellipse at ${isEven ? "75% 50%" : "25% 50%"}, ${feature.color}04, transparent 60%)`,
      }} />

      <div className="feature-row" style={{
        maxWidth: 1100, margin: "0 auto",
        display: "grid", gridTemplateColumns: "1fr 1fr",
        gap: 64, alignItems: "center",
      }}>
        {/* Text side */}
        <div style={{
          order: isEven ? 0 : 1,
          opacity: visible ? 1 : 0,
          transform: visible ? "translateX(0)" : `translateX(${isEven ? -40 : 40}px)`,
          transition: "all 0.8s cubic-bezier(0.16,1,0.3,1)",
        }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 16,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 10,
              background: `${feature.color}15`, border: `1px solid ${feature.color}25`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16,
            }}>
              {feature.icon}
            </div>
            <span style={{
              fontSize: 11, fontWeight: 700, color: feature.color,
              textTransform: "uppercase", letterSpacing: 1.5,
            }}>
              Feature {index + 1}
            </span>
          </div>

          <h3 style={{ fontSize: 28, fontWeight: 700, margin: "0 0 14px", lineHeight: 1.2 }}>
            {feature.title}
          </h3>
          <p style={{ color: "#9ca3af", lineHeight: 1.7, margin: "0 0 24px", fontSize: 16 }}>
            {feature.description}
          </p>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {feature.details.map((d, di) => (
              <span key={d} style={{
                padding: "6px 14px", borderRadius: 8,
                background: `${feature.color}08`,
                border: `1px solid ${feature.color}18`,
                fontSize: 13, color: feature.color, fontWeight: 500,
                opacity: visible ? 1 : 0,
                animation: visible ? `slideInDetail 0.4s ease-out ${0.4 + di * 0.1}s both` : "none",
              }}>
                {d}
              </span>
            ))}
          </div>
        </div>

        {/* Visual side */}
        <div style={{
          order: isEven ? 1 : 0,
          display: "flex",
          justifyContent: isEven ? "flex-end" : "flex-start",
          opacity: visible ? 1 : 0,
          transform: visible ? "translateX(0) scale(1)" : `translateX(${isEven ? 40 : -40}px) scale(0.95)`,
          transition: "all 0.8s cubic-bezier(0.16,1,0.3,1) 0.15s",
        }}>
          <FeatureMockup feature={feature} index={index} visible={visible} />
        </div>
      </div>
    </div>
  );
}

const CTA_TERMINAL_LINES: { text: string; color: string; prefix?: string; delay: number }[] = [
  { text: "stash install", prefix: "$ ", color: "#9ca3af", delay: 0 },
  { text: "✓ Extension loaded — watching 10 platforms", color: "#22c55e", delay: 0.4 },
  { text: "", color: "", delay: 0.6 },
  { text: "# You chat normally on any AI platform...", color: "#6b7280", delay: 0.8 },
  { text: "capturing claude.ai/chat/react-optimization    ██████░░ 12 msgs", color: "#f59e0b", delay: 1.2 },
  { text: "capturing chatgpt.com/c/debug-session          ████░░░░  8 msgs", color: "#10b981", delay: 1.6 },
  { text: "capturing gemini.google.com/app/perf-audit     ███░░░░░  5 msgs", color: "#6366f1", delay: 2.0 },
  { text: "", color: "", delay: 2.2 },
  { text: "# Start a new conversation — inject your context", color: "#6b7280", delay: 2.4 },
  { text: "stash inject --intent=\"optimize bundle size\"", prefix: "$ ", color: "#9ca3af", delay: 2.8 },
  { text: "⟳ Searching 25 conversations with Voyage AI embeddings...", color: "#06b6d4", delay: 3.2 },
  { text: "✓ Found 3 relevant chunks (scores: 0.94, 0.87, 0.81)", color: "#22c55e", delay: 3.6 },
  { text: "✓ Context injected — AI now has your full background", color: "#22c55e", delay: 4.0 },
];

function TerminalLine({ line, visible }: { line: typeof CTA_TERMINAL_LINES[number]; visible: boolean }) {
  const [typedChars, setTypedChars] = useState(0);
  const isCommand = !!line.prefix;
  const fullText = (line.prefix || "") + line.text;

  useEffect(() => {
    if (!visible || !isCommand) return;
    if (typedChars >= fullText.length) return;
    const t = setTimeout(() => setTypedChars(c => c + 1), 25 + Math.random() * 25);
    return () => clearTimeout(t);
  }, [visible, typedChars, isCommand, fullText.length]);

  if (!line.text) return <div style={{ height: 10 }} />;

  if (isCommand) {
    const shown = fullText.slice(0, typedChars);
    return (
      <div style={{ fontFamily: "'SF Mono', 'Fira Code', 'JetBrains Mono', Consolas, monospace", fontSize: 13, lineHeight: 1.8 }}>
        <span style={{ color: "#7c3aed" }}>{shown.slice(0, 2)}</span>
        <span style={{ color: "#e5e7eb" }}>{shown.slice(2)}</span>
        {typedChars < fullText.length && <span style={{ color: "#7c3aed", animation: "blink 1s step-end infinite" }}>▊</span>}
      </div>
    );
  }

  return (
    <div style={{
      fontFamily: "'SF Mono', 'Fira Code', 'JetBrains Mono', Consolas, monospace",
      fontSize: 13, lineHeight: 1.8, color: line.color,
      opacity: visible ? 1 : 0,
      animation: visible ? `fadeInUp 0.3s ease-out ${line.delay}s both` : "none",
    }}>
      {line.text}
    </div>
  );
}

function CtaSection() {
  const { ref, visible } = useScrollReveal(0.1);
  const [btnHovered, setBtnHovered] = useState(false);

  return (
    <section ref={ref} style={{
      padding: "40px 24px 100px", position: "relative", overflow: "hidden",
    }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>

        {/* Terminal window */}
        <div style={{
          borderRadius: 16,
          overflow: "hidden",
          background: "#0c0c0c",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 30px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.03)",
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0)" : "translateY(30px)",
          transition: "all 0.8s cubic-bezier(0.16,1,0.3,1)",
        }}>
          {/* Title bar */}
          <div style={{
            padding: "12px 16px",
            background: "#161616",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#ff5f57" }} />
            <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#febc2e" }} />
            <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#28c840" }} />
            <span style={{
              marginLeft: 12, fontSize: 12, color: "#6b7280",
              fontFamily: "'SF Mono', 'Fira Code', Consolas, monospace",
            }}>
              stash — zsh — 80×24
            </span>
            <div style={{ marginLeft: "auto", display: "flex", gap: 16 }}>
              {["⌘K", "⌘T", "⌘W"].map(k => (
                <span key={k} style={{ fontSize: 10, color: "#4b5563", fontFamily: "monospace" }}>{k}</span>
              ))}
            </div>
          </div>

          {/* Terminal body + CTA content side by side */}
          <div className="cta-inner" style={{
            display: "grid", gridTemplateColumns: "1fr 1fr",
            minHeight: 420,
          }}>
            {/* Left: terminal output */}
            <div style={{
              padding: "24px 24px",
              borderRight: "1px solid rgba(255,255,255,0.05)",
              position: "relative",
              overflow: "hidden",
            }}>
              {/* Scanline effect */}
              <div style={{
                position: "absolute", inset: 0,
                background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.01) 2px, rgba(255,255,255,0.01) 4px)",
                pointerEvents: "none",
              }} />
              {/* Line numbers gutter */}
              <div style={{ position: "relative" }}>
                {CTA_TERMINAL_LINES.map((line, i) => (
                  <div key={i} style={{ display: "flex", gap: 16 }}>
                    <span style={{
                      color: "#2d2d3d", fontSize: 11, fontFamily: "monospace",
                      width: 20, textAlign: "right", flexShrink: 0,
                      userSelect: "none", lineHeight: line.text ? 1.8 : 0.75,
                    }}>
                      {line.text ? i + 1 : ""}
                    </span>
                    <TerminalLine line={line} visible={visible} />
                  </div>
                ))}
                {/* Blinking cursor at end */}
                <div style={{ display: "flex", gap: 16 }}>
                  <span style={{ color: "#2d2d3d", fontSize: 11, fontFamily: "monospace", width: 20, textAlign: "right", lineHeight: 1.8 }}>
                    {CTA_TERMINAL_LINES.length + 1}
                  </span>
                  <span style={{
                    fontFamily: "monospace", fontSize: 13, lineHeight: 1.8,
                    opacity: visible ? 1 : 0,
                    animation: visible ? "fadeInUp 0.3s ease-out 4.5s both" : "none",
                  }}>
                    <span style={{ color: "#7c3aed" }}>$</span>
                    <span style={{ color: "#7c3aed", animation: "blink 1s step-end infinite", marginLeft: 4 }}>▊</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Right: CTA content */}
            <div style={{
              padding: "40px 40px",
              display: "flex", flexDirection: "column",
              justifyContent: "center", alignItems: "flex-start",
              position: "relative",
            }}>
              {/* Subtle code-like bg texture */}
              <div style={{
                position: "absolute", inset: 0, opacity: 0.03,
                backgroundImage: "repeating-linear-gradient(0deg, transparent 0px, transparent 23px, rgba(255,255,255,0.5) 23px, rgba(255,255,255,0.5) 24px)",
                pointerEvents: "none",
              }} />

              <div style={{
                fontSize: 11, fontFamily: "monospace", color: "#6b7280",
                marginBottom: 16, letterSpacing: 1,
                opacity: visible ? 1 : 0,
                animation: visible ? "fadeInUp 0.5s ease-out 0.3s both" : "none",
              }}>
                {"// ready to ship"}
              </div>

              <h2 style={{
                fontSize: 36, fontWeight: 800, lineHeight: 1.15, margin: "0 0 16px",
                opacity: visible ? 1 : 0,
                animation: visible ? "fadeInUp 0.6s ease-out 0.4s both" : "none",
              }}>
                <span style={{ color: "#fff" }}>Stop Losing</span>
                <br />
                <span style={{ color: "#fff" }}>Your </span>
                <span style={{ color: "#7c3aed" }}>AI</span>
                <span style={{ color: "#fff" }}> Conversations</span>
              </h2>

              <p style={{
                color: "#9ca3af", fontSize: 15, lineHeight: 1.7, margin: "0 0 10px", maxWidth: 400,
                opacity: visible ? 1 : 0,
                animation: visible ? "fadeInUp 0.5s ease-out 0.55s both" : "none",
              }}>
                Every insight, code snippet, and solution — captured automatically and ready for your next conversation.
              </p>

              <div style={{
                fontFamily: "monospace", fontSize: 12, color: "#4b5563", marginBottom: 28,
                opacity: visible ? 1 : 0,
                animation: visible ? "fadeInUp 0.5s ease-out 0.65s both" : "none",
              }}>
                free &amp;&amp; open-source &amp;&amp; privacy-first
              </div>

              {/* Button */}
              <div
                onMouseEnter={() => setBtnHovered(true)}
                onMouseLeave={() => setBtnHovered(false)}
                style={{
                  position: "relative",
                  opacity: visible ? 1 : 0,
                  animation: visible ? "fadeInUp 0.6s ease-out 0.75s both" : "none",
                }}
              >
                <div style={{
                  position: "absolute", inset: -16,
                  borderRadius: 20,
                  background: "rgba(124,58,237,0.2)",
                  filter: "blur(24px)",
                  opacity: btnHovered ? 0.8 : 0,
                  transition: "opacity 0.4s",
                }} />
                <span
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 10,
                    padding: "14px 28px", borderRadius: 10,
                    background: "transparent",
                    border: "1px solid rgba(124,58,237,0.4)",
                    color: "rgba(167,139,250,0.6)",
                    fontSize: 15, fontWeight: 600,
                    fontFamily: "'SF Mono', 'Fira Code', Consolas, monospace",
                    position: "relative", overflow: "hidden", cursor: "default",
                  }}>
                  <span style={{ position: "relative", zIndex: 1 }}>coming_soon()</span>
                </span>
              </div>

              {/* Keyboard hint */}
              <div style={{
                display: "flex", alignItems: "center", gap: 8, marginTop: 20,
                opacity: visible ? 1 : 0,
                animation: visible ? "fadeInUp 0.4s ease-out 0.9s both" : "none",
              }}>
                {[
                  { key: "↵", label: "Install" },
                  { key: "?", label: "Docs" },
                  { key: "★", label: "GitHub" },
                ].map((item) => (
                  <div key={item.key} style={{
                    display: "flex", alignItems: "center", gap: 4,
                  }}>
                    <span style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      width: 22, height: 22, borderRadius: 5,
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      fontSize: 11, color: "#6b7280", fontFamily: "monospace",
                      boxShadow: "0 1px 0 rgba(255,255,255,0.05)",
                    }}>
                      {item.key}
                    </span>
                    <span style={{ fontSize: 11, color: "#4b5563" }}>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Bottom status bar */}
          <div style={{
            padding: "8px 16px",
            background: "#161616",
            borderTop: "1px solid rgba(255,255,255,0.06)",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            fontFamily: "'SF Mono', 'Fira Code', Consolas, monospace",
            fontSize: 11, color: "#4b5563",
          }}>
            <div style={{ display: "flex", gap: 16 }}>
              <span>
                <span style={{ color: "#22c55e" }}>●</span> connected
              </span>
              <span>IndexedDB: 24 conversations</span>
            </div>
            <div style={{ display: "flex", gap: 16 }}>
              <span>sync: idle</span>
              <span>v1.0.0</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
