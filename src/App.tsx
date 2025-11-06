import { Box } from "@mui/material";
import { Simulator } from "./Simulator";
import { Timeline, type TweetData } from "./Timeline";
import { useState, useEffect, useRef } from "react";
import { Cpu } from "./cpu";
import * as Llm from "./llm";

const TIMER_INTERVAL_SEC = 60; // 60s
const SUMMARIZE_INTERVAL_SEC = 120; // 120s
const MAX_HISTORY_ITEMS = 50;
const MAX_ARCHIVED_HISTORY_ITEMS = 100;

const CUSTOM_INSTS_TWEET = import.meta.env.VITE_CUSTOM_INSTS_TWEET;
const CUSTOM_INSTS_SUMMARIZE_LOG = import.meta.env.VITE_CUSTOM_INSTS_SUMMARIZE_LOG;

export default function App() {
    const cpuRef = useRef<Cpu | null>(null);
    const summarizedLogsRef = useRef<string[]>([]);
    const isSummarizingRef = useRef(false);
    const isGeneratingTweetRef = useRef(false);

    const [tweets, setTweets] = useState<TweetData[]>([]);
    const [summarizedLogs, setSummarizedLogs] = useState<string[]>([]);
    const [isCpuRunning, setIsCpuRunning] = useState(false);

    useEffect(() => {
        console.log('[App] tweets state updated:', tweets.length);
    }, [tweets]);

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
        const addTweetLocal = (newTweet: TweetData) => {
            console.log('[App] addTweetLocal called:', newTweet.content.substring(0, 50));
            setTweets((prevTweets) => {
                console.log('[App] setTweets - prev:', prevTweets.length, 'adding 1');
                const newTweets = [newTweet, ...prevTweets];
                console.log('[App] setTweets - new:', newTweets.length);
                return newTweets;
            });
        };

        const generateTweet = async () => {
            if (!isCpuRunning)
                return;

            if (isGeneratingTweetRef.current)
                return;

            isGeneratingTweetRef.current = true;

            try {
                const cpu = cpuRef.current;
                if (!cpu)
                    return;

                const cpuHistory = cpu.history;
                const limitedHistory = cpuHistory.slice(-MAX_HISTORY_ITEMS);
                let prompt = JSON.stringify(limitedHistory);

                const latestSummaries = summarizedLogsRef.current;
                if (latestSummaries.length > 0) {
                    const summaryText = latestSummaries.map((text, i) => `${i}. ${text}`).join("\n");
                    prompt = `Summarized logs:\n${summaryText}\n\nCPU logs:\n${prompt}`;
                }

                const start = performance.now();
                const [text, fullPrompt] = await Llm.generateTextAsync(CUSTOM_INSTS_TWEET, prompt);
                const end = performance.now();
                const elapsed = ((end - start) / 1000).toFixed(2);
                const detail = `Thinking: ${elapsed}s\n\nPrompt:\n${fullPrompt}`;

                const newTweet: TweetData = {
                    user: { name: Llm.getModelName(), username: "ai_bot" },
                    content: text,
                    detail,
                    timestamp: new Date()
                };

                console.log('[App] Calling addTweet with:', {
                    content: text.substring(0, 50),
                    timestamp: newTweet.timestamp,
                });
                addTweetLocal(newTweet);
                console.log('[App] addTweet returned');
            } catch (error) {
                console.error("Error generating tweet:", error);
            } finally {
                isGeneratingTweetRef.current = false;
            }
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

                const limitedArchivedHistory = archivedHistory.slice(-MAX_ARCHIVED_HISTORY_ITEMS);
                const json = JSON.stringify(limitedArchivedHistory);
                const [text] = await Llm.generateTextAsync(CUSTOM_INSTS_SUMMARIZE_LOG, json);

                cpu.archivedHistory = []; // clear
                setSummarizedLogs((prevLogs) => [...prevLogs, text]);
            } catch (error) {
                console.error("Error generating summarized log:", error);
            } finally {
                isSummarizingRef.current = false;
            }
        }

        const initialTweetTimeout = setTimeout(() => void generateTweet(), 5 * 1000);
        const tweetTimer = setInterval(() => void generateTweet(), TIMER_INTERVAL_SEC * 1000);
        const summarizeTimer = setInterval(() => void generateSummarizedLog(), SUMMARIZE_INTERVAL_SEC * 1000);
        const initialSummarizeTimeout = setTimeout(() => void generateSummarizedLog(), 35 * 1000);

        return () => {
            clearTimeout(initialTweetTimeout);
            clearInterval(tweetTimer);
            clearInterval(summarizeTimer);
            clearTimeout(initialSummarizeTimeout);
        };
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
