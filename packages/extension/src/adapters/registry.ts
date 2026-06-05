import type { Platform, SelectorRegistry } from "../types.js";
import type { PlatformAdapter } from "./base.js";
import { ClaudeAdapter }      from "./claude.js";
import { ChatGPTAdapter }     from "./chatgpt.js";
import { GeminiAdapter }      from "./gemini.js";
import { GrokAdapter }        from "./grok.js";
import { DeepSeekAdapter }    from "./deepseek.js";
import { PerplexityAdapter }  from "./perplexity.js";
import { CopilotAdapter }     from "./copilot.js";
import { MistralAdapter }     from "./mistral.js";
import { MetaAIAdapter }      from "./metaai.js";
import { PoeAdapter }         from "./poe.js";

const ADAPTERS: PlatformAdapter[] = [
  new ClaudeAdapter(),
  new ChatGPTAdapter(),
  new GeminiAdapter(),
  new GrokAdapter(),
  new DeepSeekAdapter(),
  new PerplexityAdapter(),
  new CopilotAdapter(),
  new MistralAdapter(),
  new MetaAIAdapter(),
  new PoeAdapter(),
];

// Returns the adapter for the current page, or null if not an LLM page.
export function getAdapter(): PlatformAdapter | null {
  const host = window.location.hostname;
  return ADAPTERS.find((a) => a.domains.some((d) => host.includes(d))) ?? null;
}

// Returns the platform name for the current page.
export function getCurrentPlatform(): Platform | null {
  return getAdapter()?.platform ?? null;
}

// Returns the remote selectors for a given platform from the cached registry.
export function getSelectorsForPlatform(
  platform: Platform,
  registry: SelectorRegistry
) {
  return registry[platform] ?? null;
}

export { ADAPTERS };
