// The floating "Continue from another AI?" banner.
// Shown on new conversations when there are relevant saved conversations
// from other platforms. Fully self-contained DOM component.

import type { Conversation } from "../types.js";
import type { PlatformAdapter } from "../adapters/base.js";
import type { SelectorRegistry } from "../types.js";
import { buildBriefing } from "../types.js";
import { injectText, copyToClipboard } from "./inject.js";

const BANNER_ID = "llm-memory-banner";

let mounted = false;

export function resetBannerState(): void {
  mounted = false;
  document.getElementById(BANNER_ID)?.remove();
}

export function mountBanner(
  conversations: Conversation[],
  currentPlatform: string,
  adapter: PlatformAdapter,
  registry: SelectorRegistry
): void {
  if (mounted || document.getElementById(BANNER_ID)) return;
  mounted = true;

  // Show up to 5 conversations from other platforms, most recent first
  const shown = conversations
    .filter((c) => c.platform !== currentPlatform)
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    .slice(0, 5);

  const wrap = createBannerRoot();
  wrap.appendChild(createHeader());

  const list = document.createElement("div");
  list.style.cssText = "display:flex;flex-direction:column;gap:4px;";

  if (!shown.length) {
    const empty = document.createElement("div");
    empty.style.cssText = "font-size:12px;color:#444;text-align:center;padding:8px 0;";
    empty.textContent = "No saved conversations yet. Chat on any AI and they'll appear here.";
    list.appendChild(empty);
  } else {
    shown.forEach((conv, i) => {
      list.appendChild(createConvButton(conv, i, adapter, registry, wrap));
    });

    if (shown.length > 1) {
      wrap.appendChild(list);
      wrap.appendChild(createRandomButton(shown, adapter, registry, wrap));
      goto(wrap);
      return;
    }
  }

  wrap.appendChild(list);
  goto(wrap);
}

// ── DOM builders ───────────────────────────────────────────────────────────────

function createBannerRoot(): HTMLDivElement {
  const wrap = document.createElement("div");
  wrap.id = BANNER_ID;
  Object.assign(wrap.style, {
    position:   "fixed",
    bottom:     "24px",
    right:      "22px",
    zIndex:     "2147483647",
    background: "#0d0d0d",
    border:     "1px solid #252525",
    borderRadius: "14px",
    padding:    "15px",
    fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif',
    fontSize:   "13px",
    boxShadow:  "0 20px 60px rgba(0,0,0,.8)",
    width:      "300px",
    display:    "flex",
    flexDirection: "column",
    gap:        "10px",
    opacity:    "0",
    transform:  "translateY(14px)",
    transition: "opacity 0.28s ease, transform 0.28s cubic-bezier(0.34,1.3,0.64,1)",
  });
  return wrap;
}

function createHeader(): HTMLDivElement {
  const hdr = document.createElement("div");
  hdr.style.cssText = "display:flex;justify-content:space-between;align-items:flex-start;";
  hdr.innerHTML = `
    <div>
      <div style="font-weight:700;font-size:13.5px;color:#fff;">Continue from another AI?</div>
      <div style="font-size:11px;color:#505050;margin-top:2px;">Pick a saved conversation to load</div>
    </div>
    <button id="llm-banner-close" style="background:#1a1a1a;border:1px solid #2c2c2c;color:#555;cursor:pointer;font-size:15px;padding:3px 8px;border-radius:6px;margin-left:8px;line-height:1;">×</button>
  `;

  hdr.querySelector<HTMLButtonElement>("#llm-banner-close")!
    .addEventListener("click", () => document.getElementById(BANNER_ID)?.remove());

  return hdr;
}

function createConvButton(
  conv: Conversation,
  index: number,
  adapter: PlatformAdapter,
  registry: SelectorRegistry,
  banner: HTMLElement
): HTMLButtonElement {
  const btn = document.createElement("button");
  Object.assign(btn.style, {
    background:     "#161616",
    border:         "1px solid #222",
    borderRadius:   "9px",
    color:          "#ccc",
    padding:        "9px 11px",
    cursor:         "pointer",
    textAlign:      "left",
    fontFamily:     "inherit",
    fontSize:       "12px",
    display:        "flex",
    alignItems:     "center",
    gap:            "9px",
    width:          "100%",
    transition:     "background 0.12s, border-color 0.12s, transform 0.1s",
  });

  const timestamp = new Date(conv.updatedAt).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });

  btn.innerHTML = `
    <span style="font-size:10px;font-weight:800;color:#3a3a3a;width:12px;text-align:center;">${index + 1}</span>
    <div style="flex:1;min-width:0;">
      <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:500;color:#d5d5d5;">${escapeHtml(conv.title)}</div>
      <div style="font-size:10.5px;color:#444;margin-top:2px;">${conv.platform} · ${timestamp}</div>
    </div>
    <span style="font-size:11px;color:#333;">→</span>
  `;

  btn.addEventListener("mouseenter", () => {
    btn.style.background   = "#1e1e1e";
    btn.style.borderColor  = "#383838";
    btn.style.transform    = "translateX(2px)";
  });
  btn.addEventListener("mouseleave", () => {
    btn.style.background   = "#161616";
    btn.style.borderColor  = "#222";
    btn.style.transform    = "translateX(0)";
  });

  btn.addEventListener("click", () => {
    const text = buildBriefing(conv, "full");
    const ok   = injectText(text, adapter, registry);
    banner.remove();
    if (!ok) copyToClipboard(text);
  });

  return btn;
}

function createRandomButton(
  shown: Conversation[],
  adapter: PlatformAdapter,
  registry: SelectorRegistry,
  banner: HTMLElement
): HTMLButtonElement {
  const btn = document.createElement("button");
  Object.assign(btn.style, {
    background:   "none",
    border:       "1px solid #222",
    color:        "#555",
    borderRadius: "7px",
    padding:      "7px",
    fontSize:     "12px",
    fontWeight:   "600",
    cursor:       "pointer",
    fontFamily:   "inherit",
    transition:   "all 0.12s",
  });
  btn.textContent = "↻  Pick random";

  btn.addEventListener("mouseenter", () => {
    btn.style.borderColor = "#fff";
    btn.style.color       = "#fff";
  });
  btn.addEventListener("mouseleave", () => {
    btn.style.borderColor = "#222";
    btn.style.color       = "#555";
  });
  btn.addEventListener("click", () => {
    const pick = shown[Math.floor(Math.random() * shown.length)]!;
    const text = buildBriefing(pick, "full");
    const ok   = injectText(text, adapter, registry);
    banner.remove();
    if (!ok) copyToClipboard(text);
  });

  return btn;
}

function goto(wrap: HTMLElement): void {
  document.body.appendChild(wrap);
  requestAnimationFrame(() => {
    wrap.style.opacity   = "1";
    wrap.style.transform = "translateY(0)";
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
