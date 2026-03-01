export interface CostEstimate {
    inputCost: number;
    outputCost: number;
    totalCost: number;
    currency: string;
    inputRate: number;
    outputRate: number;
}

export const calculateCost = (modelId: string, promptTokens: number, outputTokens: number): CostEstimate => {
    let inputRatePer1M = 0;
    let outputRatePer1M = 0;

    // Normalized Model IDs (handling variations or preview suffixes)
    const normalizedId = modelId.toLowerCase();

    if (normalizedId.includes("gemini-3-pro-image") || normalizedId.includes("banana")) {
        // Pricing based on Image Generation Preview
        // Input: ~$0.001 per image (approx ~2-3k tokens?). Let's use robust token pricing if possible.
        // Search said: Output ~ $120.00 / 1M tokens. Input ~ $2.00?
        // Let's assume standard Gemini 3 Pro logic for text parts, but if it's image gen, the output is expensive.
        inputRatePer1M = 2.00; // Placeholder for input
        outputRatePer1M = 120.00; // $0.134 per image / ~1120 tokens => ~$120/1M
    } else if (normalizedId.includes("gemini-1.5-pro")) {
        inputRatePer1M = 3.50; // < 128k context
        outputRatePer1M = 10.50;
    } else if (normalizedId.includes("gemini-1.5-flash")) {
        inputRatePer1M = 0.075;
        outputRatePer1M = 0.30;
    } else if (normalizedId.includes("gemini-3-pro")) {
        // Standard Text 3 Pro
        inputRatePer1M = 2.00; // Preview pricing
        outputRatePer1M = 12.00; // Preview pricing (text)
    } else {
        // Fallback/Unknown
        return { inputCost: 0, outputCost: 0, totalCost: 0, currency: "USD", inputRate: 0, outputRate: 0 };
    }

    const inputCost = (promptTokens / 1_000_000) * inputRatePer1M;
    const outputCost = (outputTokens / 1_000_000) * outputRatePer1M;

    return {
        inputCost,
        outputCost,
        totalCost: inputCost + outputCost,
        currency: "USD",
        inputRate: inputRatePer1M,
        outputRate: outputRatePer1M
    };
};
