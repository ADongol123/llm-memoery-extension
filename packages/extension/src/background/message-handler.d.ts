import type { ExtensionMessage } from "../types.js";
type Sender = chrome.runtime.MessageSender;
type SendResponse = (response: unknown) => void;
export declare function handleMessage(message: ExtensionMessage, _sender: Sender, sendResponse: SendResponse): boolean;
export {};
//# sourceMappingURL=message-handler.d.ts.map