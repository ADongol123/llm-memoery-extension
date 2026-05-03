// ── Platform ───────────────────────────────────────────────────────────────────

export type Platform =
  | "Claude"
  | "ChatGPT"
  | "Gemini"
  | "Grok"
  | "DeepSeek"
  | "Perplexity"
  | "Unknown";

export type BriefingMode = "full" | "summary" | "keypoints";

// ── Message ────────────────────────────────────────────────────────────────────

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: number;
}

// ── Entities extracted from a conversation ─────────────────────────────────────

export interface CodeBlock {
  language: string;
  snippet: string;
  description: string;
}

export interface ConversationEntities {
  code: CodeBlock[];
  decisions: string[];
  questions: string[];        // open questions left unresolved
  people: string[];
  projects: string[];
  urls: string[];
}

// ── Conversation ────────────────────────────────────────────────────────────────
// The raw + AI-processed record of a single LLM conversation.

export interface Conversation {
  id: string;
  userId?: string;
  workspaceId?: string;

  platform: Platform;
  sourceUrl: string;
  title: string;
  messageCount: number;
  rawMessages: Message[];

  // AI-processed (null until Edge Function runs)
  summary: string | null;
  keyPoints: string[] | null;
  openQuestions: string[] | null;
  topics: string[] | null;
  entities: ConversationEntities | null;
  processedAt: number | null;

  isAutoSave: boolean;
  isSnippet: boolean;
  pinned: boolean;

  createdAt: number;
  updatedAt: number;
}

// ── Context Package ─────────────────────────────────────────────────────────────
// The portable artifact generated from one or more conversations.
// This is what gets injected into a new LLM.

export interface ContextPackage {
  id: string;
  userId?: string;
  name: string;
  description: string;

  // The formatted document ready for injection
  document: string;

  // Structured version of the same data
  documentJson: ContextPackageDocument;

  conversationIds: string[];
  shareableSlug?: string;
  isPublic: boolean;

  createdAt: number;
  updatedAt: number;
}

export interface ContextPackageDocument {
  title: string;
  summary: string;
  decisionsMade: string[];
  openQuestions: string[];
  codeProduced: CodeBlock[];
  whereWeLeftOff: string;
  suggestedNextSteps: string[];
  sources: PackageSource[];
}

export interface PackageSource {
  platform: Platform;
  title: string;
  timestamp: string;
  messageCount: number;
}

// ── Injection Log ───────────────────────────────────────────────────────────────

export interface InjectionLog {
  id: string;
  userId?: string;
  packageId: string;
  targetPlatform: Platform;
  targetUrl: string;
  mode: BriefingMode;
  injectedAt: number;
}

// ── Workspace ────────────────────────────────────────────────────────────────────

export interface Workspace {
  id: string;
  userId: string;
  name: string;
  description: string;
  color: string;
  conversationIds: string[];
  packageIds: string[];
  createdAt: number;
  updatedAt: number;
}

// ── Selector Registry ───────────────────────────────────────────────────────────
// Fetched from backend — fixes extraction without an extension update.

export interface PlatformSelectors {
  messagesTurn: string[];         // ordered list of selectors to try
  userTurnAttr?: string;          // attribute that identifies user vs assistant
  userTurnValue?: string;
  assistantTurnValue?: string;
  sidebarLinks: string[];
  inputField: string[];
}

export type SelectorRegistry = Partial<Record<Platform, PlatformSelectors>>;

// ── Sidebar item ────────────────────────────────────────────────────────────────

export interface SidebarItem {
  title: string;
  url: string;
}

// ── Auth Session ─────────────────────────────────────────────────────────────────

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  userId: string;
  email: string;
  expiresAt: number;
}

// ── Extension messages (background ↔ content ↔ popup) ─────────────────────────

export type ExtensionMessage =
  | { type: "GET_SIDEBAR_CONVERSATIONS" }
  | { type: "GET_CONVERSATION" }
  | { type: "GET_PLATFORM" }
  | { type: "INJECT_TEXT"; text: string }
  | { type: "SAVE_CONVERSATION"; payload: Conversation }
  | { type: "AUTO_SAVE_CONVERSATION"; payload: Conversation }
  | { type: "GET_CONVERSATIONS" }
  | { type: "DELETE_CONVERSATION"; id: string }
  | { type: "UPDATE_CONVERSATION"; id: string; changes: Partial<Conversation> }
  | { type: "GET_PACKAGES" }
  | { type: "GENERATE_PACKAGE"; conversationIds: string[] }
  | { type: "DELETE_PACKAGE"; id: string }
  | { type: "INJECT_PACKAGE"; packageId: string; mode: BriefingMode }
  | { type: "GET_SETTINGS" }
  | { type: "SAVE_SETTINGS"; settings: ExtensionSettings }
  | { type: "GET_AUTH" }
  | { type: "SIGN_IN"; email: string }
  | { type: "SIGN_OUT" }
  | { type: "AUTH_CALLBACK"; accessToken: string; refreshToken: string }
  | { type: "SYNC_NOW" }
  | { type: "GET_SIDEBAR_CACHE" }
  | { type: "OPEN_POPUP" }
  | { type: "GET_SELECTOR_REGISTRY" }
  | { type: "BUMP_ANALYTIC"; key: "saves" | "injects" | "packages_generated" };

export interface ExtensionSettings {
  pickerEnabled: boolean;
  autoSaveEnabled: boolean;
  isPro: boolean;
  defaultBriefingMode: BriefingMode;
  autoSaveMinMessages: number;
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  pickerEnabled: true,
  autoSaveEnabled: true,
  isPro: false,
  defaultBriefingMode: "full",
  autoSaveMinMessages: 4,
};
