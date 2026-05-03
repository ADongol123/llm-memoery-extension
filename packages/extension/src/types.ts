// Re-export all shared types and utilities for use within the extension.
// Webpack resolves @llm-memory/shared to packages/shared/src/index.ts

export type {
  Platform,
  BriefingMode,
  Message,
  CodeBlock,
  ConversationEntities,
  Conversation,
  ContextPackage,
  ContextPackageDocument,
  PackageSource,
  InjectionLog,
  Workspace,
  PlatformSelectors,
  SelectorRegistry,
  SidebarItem,
  AuthSession,
  ExtensionMessage,
  ExtensionSettings,
} from "@llm-memory/shared";

export { DEFAULT_SETTINGS, buildBriefing, buildMergedBriefing, buildPackageBriefing, makeTitle, trimMessages } from "@llm-memory/shared";
