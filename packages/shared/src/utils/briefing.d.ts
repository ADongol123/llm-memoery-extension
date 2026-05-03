import type { Conversation, ContextPackage, ContextPackageDocument, BriefingMode, Platform } from "../types/index.js";
export declare function buildBriefing(conv: Conversation, mode?: BriefingMode): string;
export declare function buildMergedBriefing(convs: Conversation[], mode?: BriefingMode): string;
export declare function buildPackageBriefing(pkg: ContextPackage): string;
export declare function formatPackageDocument(doc: ContextPackageDocument): string;
export declare function platformColor(platform: Platform): string;
//# sourceMappingURL=briefing.d.ts.map