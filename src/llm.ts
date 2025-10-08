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

export function getModelName(): string {
    return USING_MODEL === "gemini" ? import.meta.env.VITE_GEMINI_MODEL : import.meta.env.VITE_LOCAL_MODEL;
}

export async function generateTextAsync(prompt: string): Promise<string> {
    const customInstructions = import.meta.env.VITE_CUSTOM_INSTRUCTIONS;
    const promptWithCustomInstructions = `${customInstructions}\n\n${prompt}`;

    const provider = USING_MODEL === "gemini" ? googleProvider : localProvider;
    const modelName = getModelName();

    const { text } = await generateText({
        model: provider(modelName),
        prompt: promptWithCustomInstructions,
    })
    return text;
};
