import type { Platform, SelectorRegistry } from "../types.js";
import type { PlatformAdapter } from "./base.js";
declare const ADAPTERS: PlatformAdapter[];
export declare function getAdapter(): PlatformAdapter | null;
export declare function getCurrentPlatform(): Platform | null;
export declare function getSelectorsForPlatform(platform: Platform, registry: SelectorRegistry): import("../types.js").PlatformSelectors | null;
export { ADAPTERS };
//# sourceMappingURL=registry.d.ts.map