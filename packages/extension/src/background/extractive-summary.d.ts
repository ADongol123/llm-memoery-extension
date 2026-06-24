export interface ExtractiveSummary {
    summary: string;
    keyPoints: string[];
    openQuestions: string[];
    topics: string[];
}
export declare function extractSummary(messages: Array<{
    role: string;
    content: string;
}>): Promise<ExtractiveSummary>;
//# sourceMappingURL=extractive-summary.d.ts.map