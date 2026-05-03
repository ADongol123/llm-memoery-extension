import type { Message, Platform, SidebarItem, PlatformSelectors } from "../types.js";
export interface PlatformAdapter {
    readonly platform: Platform;
    readonly domains: string[];
    extractConversation(selectors?: PlatformSelectors): Message[];
    getSidebarConversations(selectors?: PlatformSelectors): SidebarItem[];
    findInputElement(selectors?: PlatformSelectors): HTMLElement | null;
    injectText(text: string, selectors?: PlatformSelectors): boolean;
    isNewConversation(): boolean;
}
export declare function injectIntoElement(el: HTMLElement, text: string): boolean;
export declare function deduplicateSidebar(items: SidebarItem[]): SidebarItem[];
export declare function querySelector<T extends Element>(selectors: string[], root?: Document | Element): T | null;
export declare function querySelectorAll<T extends Element>(selectors: string[], root?: Document | Element): T[];
//# sourceMappingURL=base.d.ts.map