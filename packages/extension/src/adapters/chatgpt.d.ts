import type { Message, SidebarItem, PlatformSelectors } from "../types.js";
import type { PlatformAdapter } from "./base.js";
export declare class ChatGPTAdapter implements PlatformAdapter {
    readonly platform: "ChatGPT";
    readonly domains: string[];
    extractConversation(selectors?: PlatformSelectors): Message[];
    getSidebarConversations(selectors?: PlatformSelectors): SidebarItem[];
    findInputElement(selectors?: PlatformSelectors): HTMLElement | null;
    injectText(text: string, selectors?: PlatformSelectors): boolean;
    isNewConversation(): boolean;
}
//# sourceMappingURL=chatgpt.d.ts.map