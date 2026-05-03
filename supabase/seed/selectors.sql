-- Seed the selector registry with current working selectors for all 5 platforms.
-- Update this row when a platform changes their UI — all extension installs fix instantly.

insert into selector_registry (platform, version, selectors) values

('Claude', 1, '{
  "messagesTurn": [
    "[data-testid=\"human-turn\"]",
    "[data-testid=\"ai-turn\"]",
    "[data-message-role]"
  ],
  "userTurnAttr": "data-testid",
  "userTurnValue": "human-turn",
  "assistantTurnValue": "ai-turn",
  "sidebarLinks": [
    "nav a[href*=\"/chat/\"]",
    "a[href*=\"/chat/\"]"
  ],
  "inputField": [
    "div.ProseMirror[contenteditable=\"true\"]",
    "[contenteditable=\"true\"]"
  ]
}'),

('ChatGPT', 1, '{
  "messagesTurn": [
    "[data-message-author-role]"
  ],
  "userTurnAttr": "data-message-author-role",
  "userTurnValue": "user",
  "assistantTurnValue": "assistant",
  "sidebarLinks": [
    "a[href^=\"/c/\"]",
    "nav li a",
    "nav ol li a"
  ],
  "inputField": [
    "#prompt-textarea",
    "[contenteditable=\"true\"]"
  ]
}'),

('Gemini', 1, '{
  "messagesTurn": [
    ".query-text",
    ".user-query-bubble .query-text-container",
    "message-content .markdown",
    "model-response .response-text"
  ],
  "userTurnAttr": null,
  "userTurnValue": null,
  "assistantTurnValue": null,
  "sidebarLinks": [
    "a[href*=\"/app/\"]",
    "bard-sidenav-item a",
    ".sidenav-item a",
    "[data-conversation-id]"
  ],
  "inputField": [
    ".ql-editor[contenteditable=\"true\"]",
    "rich-textarea [contenteditable=\"true\"]",
    "[contenteditable=\"true\"]"
  ]
}'),

('Grok', 1, '{
  "messagesTurn": [
    "[class*=\"UserMessage\"]",
    "[class*=\"user-message\"]",
    "[class*=\"AssistantMessage\"]",
    "[class*=\"BotMessage\"]"
  ],
  "userTurnAttr": "class",
  "userTurnValue": "UserMessage",
  "assistantTurnValue": "AssistantMessage",
  "sidebarLinks": [
    "a[href*=\"/conversation/\"]",
    "a[href*=\"/chat/\"]",
    "nav a",
    "aside a"
  ],
  "inputField": [
    "textarea",
    "[contenteditable=\"true\"]"
  ]
}'),

('DeepSeek', 1, '{
  "messagesTurn": [
    "[class*=\"user-message\"]",
    "[class*=\"UserMessage\"]",
    "[data-role=\"user\"]",
    "[class*=\"assistant-message\"]",
    "[class*=\"AssistantMessage\"]",
    "[data-role=\"assistant\"]",
    ".ds-markdown"
  ],
  "userTurnAttr": "data-role",
  "userTurnValue": "user",
  "assistantTurnValue": "assistant",
  "sidebarLinks": [
    "a[href*=\"/chat/\"]",
    "a[href*=\"/session/\"]",
    ".conversation-list a",
    ".chat-list a",
    "aside a",
    "nav a"
  ],
  "inputField": [
    "textarea",
    "[contenteditable=\"true\"]"
  ]
}'),

('Perplexity', 1, '{
  "messagesTurn": [
    "[data-testid=\"user-message\"]",
    "[data-testid=\"answer\"]"
  ],
  "userTurnAttr": "data-testid",
  "userTurnValue": "user-message",
  "assistantTurnValue": "answer",
  "sidebarLinks": [
    "a[href^=\"/search/\"]",
    "a[href^=\"/thread/\"]"
  ],
  "inputField": [
    "textarea",
    "[contenteditable=\"true\"]"
  ]
}')

on conflict (platform) do update
  set selectors = excluded.selectors,
      version   = selector_registry.version + 1,
      updated_at = now();
