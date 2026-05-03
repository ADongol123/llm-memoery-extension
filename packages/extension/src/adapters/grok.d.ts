import type { Message, SidebarItem, PlatformSelectors } from "../types.js";
import type { PlatformAdapter } from "./base.js";
export declare class GrokAdapter implements PlatformAdapter {
    readonly platform: "Grok";
    readonly domains: string[];
    extractConversation(_selectors?: PlatformSelectors): Message[];
    getSidebarConversations(selectors?: PlatformSelectors): SidebarItem[];
    findInputElement(selectors?: PlatformSelectors): HTMLElement | null;
    injectText(text: string, selectors?: PlatformSelectors): boolean;
    isNewConversation(): boolean;
}
//# sourceMappingURL=grok.d.ts.map