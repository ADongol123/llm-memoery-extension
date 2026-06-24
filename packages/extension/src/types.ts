// Re-export all shared types and utilities for use within the extension.
// Webpack resolves @stash/shared to packages/shared/src/index.ts

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
  Chunk,
  KnowledgeBrief,
  TransferSession,
  ExtensionMessage,
  ExtensionSettings,
} from "@stash/shared";

export { DEFAULT_SETTINGS, ALL_PLATFORMS, buildBriefing, buildMergedBriefing, buildPackageBriefing, makeTitle, trimMessages } from "@stash/shared";
