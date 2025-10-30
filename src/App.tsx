import { Box } from "@mui/material";
import { Simulator } from "./Simulator";
import { Timeline, type TweetData } from "./Timeline";
import { useState, useEffect, useRef } from "react";
import { Cpu } from "./cpu";
import * as Llm from "./llm";

const TIMER_INTERVAL_SEC = 60; // 60s

const CUSTOM_INSTS_TWEET = import.meta.env.VITE_CUSTOM_INSTS_TWEET;
const CUSTOM_INSTS_SUMMARIZE_LOG = import.meta.env.VITE_CUSTOM_INSTS_SUMMARIZE_LOG;

export default function App() {
    const cpuRef = useRef<Cpu | null>(null);
    const summarizedLogsRef = useRef<string[]>([]);
    const isSummarizingRef = useRef(false);

    const [tweets, setTweets] = useState<TweetData[]>([]);
    const [summarizedLogs, setSummarizedLogs] = useState<string[]>([]);
    const [isCpuRunning, setIsCpuRunning] = useState(false);

    const addTweet = (newTweet: TweetData) => {
        setTweets((prevTweets) => [newTweet, ...prevTweets]);
    };

    const handleRunningChange = (isRunning: boolean) => {
        setIsCpuRunning(isRunning);
    };

    useEffect(() => {
        // initialize cpu
        cpuRef.current = new Cpu();
    }, []);

    useEffect(() => {
        summarizedLogsRef.current = summarizedLogs;
    }, [summarizedLogs]);

    useEffect(() => {
        const generateTweet = () => {
            if (!isCpuRunning)
                return;

            const cpu = cpuRef.current;
            if (!cpu)
                return;

            const cpuHistory = cpu.history;
            let prompt = JSON.stringify(cpuHistory);

            void generateSummarizedLog();

            const latestSummaries = summarizedLogsRef.current;
            if (latestSummaries.length > 0) {
                prompt = `Summarized logs:\n${latestSummaries.map((text, i) => `${i}. ${text}`).join("\n")}\n\nCPU logs:\n` + prompt;
            }

            const start = performance.now();
            Llm.generateTextAsync(CUSTOM_INSTS_TWEET, prompt).then(([text, prompt]) => {
                const end = performance.now();
                const elapsed = ((end - start) / 1000).toFixed(2);
                const detail = `Thinking: ${elapsed}s\n\nPrompt:\n${prompt}`;

                const newTweet: TweetData = {
                    user: { name: Llm.getModelName(), username: "ai_bot" },
                    content: text,
                    detail,
                    timestamp: new Date()
                };
                addTweet(newTweet);
            });
        };

        const generateSummarizedLog = async () => {
            if (!isCpuRunning)
                return;

            if (isSummarizingRef.current)
                return;

            isSummarizingRef.current = true;

            try {
                const cpu = cpuRef.current;
                if (!cpu) return;

                const archivedHistory = cpu.archivedHistory;
                if (!archivedHistory || archivedHistory.length === 0) {
                    return;
                }

                const json = JSON.stringify(archivedHistory);
                const [text] = await Llm.generateTextAsync(CUSTOM_INSTS_SUMMARIZE_LOG, json);
                cpu.archivedHistory = []; // clear
                setSummarizedLogs((prevLogs) => [...prevLogs, text]);
            } finally {
                isSummarizingRef.current = false;
            }
        }

        const timer = setInterval(generateTweet, TIMER_INTERVAL_SEC * 1000);

        return () => clearInterval(timer);
    }, [isCpuRunning]);

    return (
        <Box sx={{ display: "flex", height: "100vh", width: "100%" }}>
            <Box sx={{ flex: 1, overflow: "auto" }}>
                <Simulator cpuRef={cpuRef} onRunningChange={handleRunningChange} />
            </Box>
            <Box sx={{
                width: "25%",
                minWidth: "300px",
                maxWidth: "500px",
                overflow: "hidden",
                borderLeft: 1,
                borderColor: "divider"
            }}>
                <Timeline tweets={tweets} />
            </Box>
        </Box>
    )
}
