interface RawMessage {
    role: string;
    content: string;
}
export declare function processConversation(conversationId: string, rawMessages: RawMessage[], title: string): Promise<void>;
export declare function retrieveContext(conversationIds: string[], intent: string): Promise<{
    synthesizedContext: string;
    keyArtifacts: Array<{
        type: string;
        content: string;
        label: string;
    }>;
    openQuestions: string[];
    topicTags: string[];
    sourceCount: number;
}>;
export {};
//# sourceMappingURL=process-conversation.d.ts.map