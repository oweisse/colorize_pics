import { GoogleGenerativeAI } from "@google/generative-ai";

export async function getAvailableModels(apiKey: string): Promise<string[]> {
    if (!apiKey) throw new Error("API Key is missing");
    // const genAI = new GoogleGenerativeAI(apiKey);
    // Note: listModels is on the GoogleGenerativeAI instance directly or via a manager?
    // Checking docs/types from previous grep: it seems we might need to use the specific endpoint behavior.
    // Actually, standard SDK usage:
    // const genAI = new GoogleGenerativeAI(API_KEY);
    // const model = genAI.getGenerativeModel({ model: "MODEL_NAME" });
    // There isn't always a direct 'listModels' on the main class in the JS SDK (unlike Python).
    // But wait, the error message SAID: "Call ListModels to see...".
    // Let's try to find if it exists on the SDK.

    // If not available in the high-level SDK, I might need to fetch the API endpoint directly.
    // https://generativelanguage.googleapis.com/v1beta/models?key=API_KEY

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        if (!response.ok) throw new Error(response.statusText);
        const data = await response.json();
        return data.models?.map((m: any) => m.name.replace('models/', '')) || [];
    } catch (e) {
        console.error("Failed to list models", e);
        return [];
    }
}

export interface ColorizeResult {
    imageUrl: string;
    usage?: {
        promptTokens: number;
        candidatesTokens: number;
        totalTokens: number;
    };
    text?: string;
}

export async function colorizeImage(apiKey: string, imageBase64: string, promptInstruction: string, modelId: string = "gemini-1.5-pro"): Promise<ColorizeResult> {
    if (!apiKey) throw new Error("API Key is missing");

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: modelId });

    const prompt = promptInstruction || "Colorize this black and white photo realistically. Return ONLY the colorized image data.";

    // Convert base64 to GenerativePart
    const imagePart = {
        inlineData: {
            data: imageBase64.split(",")[1], // Remove header
            mimeType: "image/jpeg", // Assume jpeg or png, maybe detect
        },
    };

    try {
        const result = await model.generateContent([prompt, imagePart]);
        const response = await result.response;
        const usage = result.response.usageMetadata ? {
            promptTokens: result.response.usageMetadata.promptTokenCount,
            candidatesTokens: result.response.usageMetadata.candidatesTokenCount,
            totalTokens: result.response.usageMetadata.totalTokenCount
        } : undefined;

        // Check for image parts in the response
        if (response.candidates && response.candidates[0]?.content?.parts) {
            for (const part of response.candidates[0].content.parts) {
                if (part.inlineData && part.inlineData.mimeType.startsWith("image")) {
                    return {
                        imageUrl: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
                        usage
                    };
                }
            }
        }

        // ... existing code ...
        const text = response.text();
        return { imageUrl: "", text, usage };
    } catch (error) {
        console.error("Error calling Gemini:", error);
        throw error;
    }
}

export interface AutoEditResult {
    rotation: number; // 0, 90, 180, 270
    crop?: {
        ymin: number;
        xmin: number;
        ymax: number;
        xmax: number;
    };
}

export async function analyzeImageForEdit(apiKey: string, imageBase64: string): Promise<AutoEditResult> {
    if (!apiKey) throw new Error("API Key is missing");

    const genAI = new GoogleGenerativeAI(apiKey);
    // Use gemini-2.5-flash as requested by user and for better availability/performance.
    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: { responseMimeType: "application/json" }
    });

    const prompt = `
    Analyze this image to determine:
    1. The rotation (0, 90, 180, 270 degrees clockwise) required to make the image upright (so people are heads-up, feet-down).
    2. The cropping bounding box to remove any scan borders, white/black edges, or frame, keeping the main meaningful content.
    
    Return ONLY a JSON object with this structure:
    {
        "rotation": number,
        "crop": {
            "ymin": number, // 0-100 percentage
            "xmin": number, // 0-100 percentage
            "ymax": number, // 0-100 percentage
            "xmax": number  // 0-100 percentage
        }
    }
    `;

    const imagePart = {
        inlineData: {
            data: imageBase64.split(",")[1],
            mimeType: "image/jpeg",
        },
    };

    try {
        const result = await model.generateContent([prompt, imagePart]);
        const response = await result.response;
        const text = response.text();
        const data = JSON.parse(text) as AutoEditResult;
        return data;
    } catch (error) {
        console.error("Error analyzing image:", error);
        throw error;
    }
}

