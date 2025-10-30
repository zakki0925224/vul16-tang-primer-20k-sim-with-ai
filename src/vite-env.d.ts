/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_GEMINI_API_KEY: string
    readonly VITE_GEMINI_MODEL: string
    readonly VITE_LOCAL_MODEL: string
    readonly VITE_LOCAL_BASE_URL: string
    readonly VITE_CUSTOM_INSTS_TWEET: string
    readonly VITE_CUSTOM_INSTS_SUMMARIZE_LOG: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}

declare module '*.bin?url' {
    const url: string;
    export default url;
}
