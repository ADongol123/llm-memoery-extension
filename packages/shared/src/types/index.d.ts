export type Platform = "Claude" | "ChatGPT" | "Gemini" | "Grok" | "DeepSeek" | "Perplexity" | "Unknown";
export type BriefingMode = "full" | "summary" | "keypoints";
export interface Message {
    role: "user" | "assistant" | "system";
    content: string;
    timestamp?: number;
}
export interface CodeBlock {
    language: string;
    snippet: string;
    description: string;
}
export interface ConversationEntities {
    code: CodeBlock[];
    decisions: string[];
    questions: string[];
    people: string[];
    projects: string[];
    urls: string[];
}
export interface Conversation {
    id: string;
    userId?: string;
    workspaceId?: string;
    platform: Platform;
    sourceUrl: string;
    title: string;
    messageCount: number;
    rawMessages: Message[];
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
export interface ContextPackage {
    id: string;
    userId?: string;
    name: string;
    description: string;
    document: string;
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
export interface InjectionLog {
    id: string;
    userId?: string;
    packageId: string;
    targetPlatform: Platform;
    targetUrl: string;
    mode: BriefingMode;
    injectedAt: number;
}
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
export interface PlatformSelectors {
    messagesTurn: string[];
    userTurnAttr?: string;
    userTurnValue?: string;
    assistantTurnValue?: string;
    sidebarLinks: string[];
    inputField: string[];
}
export type SelectorRegistry = Partial<Record<Platform, PlatformSelectors>>;
export interface SidebarItem {
    title: string;
    url: string;
}
export interface AuthSession {
    accessToken: string;
    refreshToken: string;
    userId: string;
    email: string;
    expiresAt: number;
}
export type ExtensionMessage = {
    type: "GET_SIDEBAR_CONVERSATIONS";
} | {
    type: "GET_CONVERSATION";
} | {
    type: "GET_PLATFORM";
} | {
    type: "INJECT_TEXT";
    text: string;
} | {
    type: "SAVE_CONVERSATION";
    payload: Conversation;
} | {
    type: "AUTO_SAVE_CONVERSATION";
    payload: Conversation;
} | {
    type: "GET_CONVERSATIONS";
} | {
    type: "DELETE_CONVERSATION";
    id: string;
} | {
    type: "UPDATE_CONVERSATION";
    id: string;
    changes: Partial<Conversation>;
} | {
    type: "GET_PACKAGES";
} | {
    type: "GENERATE_PACKAGE";
    conversationIds: string[];
} | {
    type: "DELETE_PACKAGE";
    id: string;
} | {
    type: "INJECT_PACKAGE";
    packageId: string;
    mode: BriefingMode;
} | {
    type: "GET_SETTINGS";
} | {
    type: "SAVE_SETTINGS";
    settings: ExtensionSettings;
} | {
    type: "GET_AUTH";
} | {
    type: "SIGN_IN";
    email: string;
} | {
    type: "SIGN_OUT";
} | {
    type: "AUTH_CALLBACK";
    accessToken: string;
    refreshToken: string;
} | {
    type: "SYNC_NOW";
} | {
    type: "GET_SELECTOR_REGISTRY";
} | {
    type: "BUMP_ANALYTIC";
    key: "saves" | "injects" | "packages_generated";
};
export interface ExtensionSettings {
    pickerEnabled: boolean;
    autoSaveEnabled: boolean;
    isPro: boolean;
    defaultBriefingMode: BriefingMode;
    autoSaveMinMessages: number;
}
export declare const DEFAULT_SETTINGS: ExtensionSettings;
//# sourceMappingURL=index.d.ts.map