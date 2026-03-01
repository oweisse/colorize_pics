import { colorizeImage, type ColorizeResult } from './gemini';
import { calculateCost } from './pricing';
import { type CostDetails } from '../App';

export interface ProcessResult {
    imageUrl: string;
    cost?: number;
    costDetails?: CostDetails;
    prompt: string;
}

export const processImageColorization = async (
    file: File,
    apiKey: string,
    prompt: string,
    modelId: string = "gemini-3.1-flash-image-preview",
    objectUrl?: string
): Promise<ProcessResult> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onloadend = async () => {
            const base64data = reader.result as string;
            try {
                const result: ColorizeResult = await colorizeImage(apiKey, base64data, prompt, modelId);

                let estimate: {
                    totalCost: number;
                    inputCost: number;
                    outputCost: number;
                    inputRate: number;
                    outputRate: number;
                } | undefined;

                let newCostDetails: CostDetails | undefined;

                if (result.usage) {
                    estimate = calculateCost(modelId, result.usage.promptTokens, result.usage.candidatesTokens);
                    newCostDetails = {
                        total: estimate.totalCost,
                        input: estimate.inputCost,
                        output: estimate.outputCost,
                        inputTokens: result.usage.promptTokens,
                        outputTokens: result.usage.candidatesTokens,
                        inputRate: estimate.inputRate,
                        outputRate: estimate.outputRate
                    };
                }

                if (result.imageUrl) {
                    resolve({
                        imageUrl: result.imageUrl,
                        cost: estimate?.totalCost,
                        costDetails: newCostDetails,
                        prompt: prompt
                    });
                } else if (result.text) {
                    if (result.text.startsWith('http') || result.text.startsWith('data:image')) {
                        resolve({
                            imageUrl: result.text,
                            cost: estimate?.totalCost,
                            costDetails: newCostDetails,
                            prompt: prompt
                        });
                    } else if (objectUrl) {
                        // Fallback logic requiring objectUrl to simulate result on canvas
                        const img = new Image();
                        img.src = objectUrl;
                        img.onload = () => {
                            const canvas = document.createElement('canvas');
                            canvas.width = img.width;
                            canvas.height = img.height;
                            const ctx = canvas.getContext('2d');
                            if (ctx) {
                                ctx.drawImage(img, 0, 0);
                                ctx.globalCompositeOperation = 'overlay';
                                ctx.fillStyle = 'rgba(255, 100, 50, 0.2)';
                                ctx.fillRect(0, 0, canvas.width, canvas.height);
                                resolve({
                                    imageUrl: canvas.toDataURL('image/jpeg'),
                                    cost: estimate?.totalCost,
                                    costDetails: newCostDetails,
                                    prompt: prompt
                                });
                            } else {
                                reject(new Error("Failed to create canvas context"));
                            }
                        };
                        img.onerror = () => reject(new Error("Failed to load image for fallback"));
                    } else {
                        reject(new Error(`${modelId} returned text and no objectUrl provided for fallback simulation.`));
                    }
                } else {
                    reject(new Error("No image URL or Text returned from API"));
                }
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = () => reject(new Error("Failed to read file"));
    });
};
