import { generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

type Model = "gemini" | "local";
const USING_MODEL: Model = "gemini";

const googleProvider = createGoogleGenerativeAI({
    apiKey: import.meta.env.VITE_GEMINI_API_KEY,
});

const localProvider = createOpenAICompatible({
    name: "lmstudio",
    baseURL: import.meta.env.VITE_LOCAL_BASE_URL,
});

const MAX_CONTEXT_TOKENS = 4096;
const MAX_PROMPT_CHARS = Math.floor(MAX_CONTEXT_TOKENS * 2 * 0.7);

let isGenerating = false;

export function getModelName(): string {
    return USING_MODEL === "gemini" ? import.meta.env.VITE_GEMINI_MODEL : import.meta.env.VITE_LOCAL_MODEL;
}

function truncatePrompt(prompt: string, customInstructions: string): string {
    const instructionsLength = customInstructions.length;
    const maxPromptLength = MAX_PROMPT_CHARS - instructionsLength - 100;

    if (prompt.length <= maxPromptLength) {
        return prompt;
    }

    const truncated = prompt.slice(0, maxPromptLength);
    console.warn(`[LLM] Prompt truncated from ${prompt.length} to ${maxPromptLength} characters`);
    return truncated;
}

export async function generateTextAsync(customInstructions: string, prompt: string): Promise<[string, string]> {
    if (isGenerating) {
        throw new Error("Another generation is in progress.");
    }

    isGenerating = true;
    try {
        console.log('[LLM] Original prompt:', {
            instructionsLength: customInstructions.length,
            promptLength: prompt.length,
            totalLength: customInstructions.length + prompt.length + 2, // +2 for "\n\n"
            promptPreview: prompt.substring(0, 500) + (prompt.length > 500 ? '...' : ''),
        });

        const truncatedPrompt = truncatePrompt(prompt, customInstructions);
        const promptWithCustomInstructions = `${customInstructions}\n\n${truncatedPrompt}`;

        console.log('[LLM] After truncation:', {
            instructionsLength: customInstructions.length,
            promptLength: prompt.length,
            truncatedPromptLength: truncatedPrompt.length,
            totalLength: promptWithCustomInstructions.length,
            wasTruncated: truncatedPrompt.length < prompt.length,
        });

        const provider = USING_MODEL === "gemini" ? googleProvider : localProvider;
        const modelName = getModelName();

        const { text } = await generateText({
            model: provider(modelName),
            prompt: promptWithCustomInstructions,
        })

        console.log('[LLM] Response received:', {
            responseLength: text.length,
            responsePreview: text.substring(0, 200),
        });

        return [text, promptWithCustomInstructions];
    }
    catch (error) {
        console.error("Error during text generation:", error);
        throw error;
    }
    finally {
        isGenerating = false;
    }
};
