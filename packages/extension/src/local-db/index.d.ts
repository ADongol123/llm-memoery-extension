import type { Conversation, ContextPackage, ExtensionSettings, SelectorRegistry } from "../types.js";
export declare function saveConversation(conv: Conversation): Promise<void>;
export declare function upsertConversationByUrl(conv: Conversation): Promise<void>;
export declare function getConversationByUrl(url: string): Promise<Conversation | null>;
export declare function getAllConversations(): Promise<Conversation[]>;
export declare function getConversation(id: string): Promise<Conversation | null>;
export declare function updateConversation(id: string, changes: Partial<Conversation>): Promise<void>;
export declare function deleteConversation(id: string): Promise<void>;
export declare function savePackage(pkg: ContextPackage): Promise<void>;
export declare function getAllPackages(): Promise<ContextPackage[]>;
export declare function getPackage(id: string): Promise<ContextPackage | null>;
export declare function deletePackage(id: string): Promise<void>;
export declare function getSettings(): Promise<ExtensionSettings>;
export declare function saveSettings(settings: ExtensionSettings): Promise<void>;
export declare function getCachedSelectors(): Promise<SelectorRegistry | null>;
export declare function cacheSelectors(registry: SelectorRegistry): Promise<void>;
export declare function getPendingSyncOps(): Promise<{
    id: string;
    type: "upsert" | "delete";
    table: string;
    payload: unknown;
    createdAt: number;
}[]>;
export declare function deleteSyncOp(id: string): Promise<void>;
export declare function clearSyncQueue(): Promise<void>;
//# sourceMappingURL=index.d.ts.map