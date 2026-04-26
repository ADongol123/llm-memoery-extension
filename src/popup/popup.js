const $ = (id) => document.getElementById(id);

const toggleInput   = $("toggleInput");
const statusDot     = $("statusDot");
const statusText    = $("statusText");
const recentSection = $("recentSection");
const idleState     = $("idleState");
const convList      = $("convList");
const loadingState  = $("loadingState");
const platformLabel = $("platformLabel");
const randomBtn     = $("randomBtn");
const toast         = $("toast");

let currentConvs = [];

// ── Toast ──────────────────────────────────────────────────────────────────────

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.remove("hidden");
  clearTimeout(showToast._t);
  // Re-trigger animation
  void toast.offsetWidth;
  showToast._t = setTimeout(() => toast.classList.add("hidden"), 2500);
}

// ── Toggle UI ──────────────────────────────────────────────────────────────────

function applyToggleUI(isOn) {
  statusDot.className = `dot ${isOn ? "dot-on" : "dot-off"}`;
  statusText.textContent = isOn ? "Picker is active" : "Picker is off";
}

// ── Render conversation list ──────────────────────────────────────────────────

function renderConvs(convs, platformName) {
  currentConvs = convs;
  loadingState.classList.add("hidden");

  if (!convs.length) {
    idleState.classList.remove("hidden");
    recentSection.classList.add("hidden");
    return;
  }

  idleState.classList.add("hidden");
  recentSection.classList.remove("hidden");
  platformLabel.textContent = `Recent on ${platformName}`;

  convList.innerHTML = "";
  convs.forEach((conv, i) => {
    const item = document.createElement("div");
    item.className = "conv-item";
    item.innerHTML = `
      <span class="conv-num">${i + 1}</span>
      <span class="conv-title" title="${conv.title}">${conv.title}</span>
      <span class="conv-arrow">→</span>
    `;
    item.addEventListener("click", () => navigateToConv(conv));
    convList.appendChild(item);
  });
}

function navigateToConv(conv) {
  if (!conv.url) return;
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab) return;
    chrome.tabs.update(tab.id, { url: conv.url });
    window.close();
  });
}

function pickRandom() {
  if (!currentConvs.length) return;
  const idx = Math.floor(Math.random() * currentConvs.length);
  const conv = currentConvs[idx];

  // Flash the item then navigate
  const items = convList.querySelectorAll(".conv-item");
  if (items[idx]) {
    items[idx].classList.add("flashing");
  }
  setTimeout(() => navigateToConv(conv), 500);
}

// ── Load recent conversations from active tab ─────────────────────────────────

async function loadRecentConvs() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    idleState.classList.remove("hidden");
    return;
  }

  recentSection.classList.remove("hidden");
  idleState.classList.add("hidden");
  loadingState.classList.remove("hidden");
  convList.innerHTML = "";

  chrome.tabs.sendMessage(tab.id, { type: "GET_RECENT_CONVERSATIONS" }, (res) => {
    if (chrome.runtime.lastError || !res?.success || !res.conversations?.length) {
      loadingState.classList.add("hidden");
      idleState.classList.remove("hidden");
      recentSection.classList.add("hidden");
      return;
    }
    renderConvs(res.conversations, res.platform || "AI");
  });
}

// ── Init ───────────────────────────────────────────────────────────────────────

async function init() {
  const { llm_picker_enabled: isOn = false } =
    await chrome.storage.local.get("llm_picker_enabled");

  toggleInput.checked = isOn;
  applyToggleUI(isOn);

  if (isOn) {
    await loadRecentConvs();
  }
}

// ── Events ─────────────────────────────────────────────────────────────────────

toggleInput.addEventListener("change", async () => {
  const isOn = toggleInput.checked;
  await chrome.storage.local.set({ llm_picker_enabled: isOn });
  applyToggleUI(isOn);

  if (isOn) {
    await loadRecentConvs();
  } else {
    recentSection.classList.add("hidden");
    idleState.classList.remove("hidden");
  }
});

randomBtn.addEventListener("click", pickRandom);

init();
