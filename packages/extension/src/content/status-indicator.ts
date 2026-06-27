const INDICATOR_ID = "llm-memory-status-pill";

let pillEl: HTMLDivElement | null = null;
let revertTimer: ReturnType<typeof setTimeout> | null = null;

export function createStatusIndicator(): void {
  if (document.getElementById(INDICATOR_ID)) return;

  const pill = document.createElement("div");
  pill.id = INDICATOR_ID;
  Object.assign(pill.style, {
    position:     "fixed",
    bottom:       "12px",
    left:         "12px",
    zIndex:       "2147483646",
    background:   "rgba(13,13,13,0.9)",
    border:       "1px solid rgba(40,40,40,0.6)",
    borderRadius: "12px",
    padding:      "3px 10px 3px 8px",
    fontFamily:   '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif',
    fontSize:     "10px",
    fontWeight:   "500",
    color:        "rgba(255,255,255,0.55)",
    display:      "flex",
    alignItems:   "center",
    gap:          "5px",
    opacity:      "0.35",
    transition:   "opacity 0.3s ease",
    pointerEvents: "none",
    userSelect:   "none",
  });

  pill.innerHTML = `<span style="width:5px;height:5px;border-radius:50%;background:#6366f1;flex-shrink:0;"></span><span id="llm-status-text">Stash · Active</span>`;
  document.body.appendChild(pill);
  pillEl = pill;
}

export function updateStatus(state: "active" | "saving" | "saved" | "hidden"): void {
  if (!pillEl) return;
  const textEl = pillEl.querySelector("#llm-status-text") as HTMLSpanElement;
  const dotEl = pillEl.querySelector("span") as HTMLSpanElement;
  if (!textEl || !dotEl) return;

  if (revertTimer) {
    clearTimeout(revertTimer);
    revertTimer = null;
  }

  switch (state) {
    case "active":
      textEl.textContent = "Stash · Active";
      dotEl.style.background = "#6366f1";
      pillEl.style.opacity = "0.35";
      pillEl.style.display = "flex";
      break;
    case "saving":
      textEl.textContent = "Saving...";
      dotEl.style.background = "#f59e0b";
      pillEl.style.opacity = "0.85";
      pillEl.style.display = "flex";
      break;
    case "saved":
      textEl.textContent = "Saved ✓";
      dotEl.style.background = "#10b981";
      pillEl.style.opacity = "0.85";
      pillEl.style.display = "flex";
      revertTimer = setTimeout(() => updateStatus("active"), 2000);
      break;
    case "hidden":
      pillEl.style.display = "none";
      break;
  }
}

export function removeStatusIndicator(): void {
  pillEl?.remove();
  pillEl = null;
  if (revertTimer) {
    clearTimeout(revertTimer);
    revertTimer = null;
  }
}
