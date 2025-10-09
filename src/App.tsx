import { Box } from "@mui/material";
import { Simulator } from "./Simulator";
import { Timeline, type TweetData } from "./Timeline";
import { useState, useEffect, useRef } from "react";
import { Cpu } from "./cpu";
import * as Llm from "./llm";

const TIMER_INTERVAL_SEC = 60; // 60s

export default function App() {
    const cpuRef = useRef<Cpu | null>(null);
    const [tweets, setTweets] = useState<TweetData[]>([]);
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
        const generateTweet = () => {
            if (!isCpuRunning) {
                return;
            }

            const cpu = cpuRef.current;
            if (!cpu)
                return;

            const cpuHistory = cpu.history;
            console.log(cpuHistory);
            const json = JSON.stringify(cpuHistory);

            Llm.generateTextAsync(json).then((text) => {
                const newTweet: TweetData = {
                    user: { name: Llm.getModelName(), username: "ai_bot" },
                    content: text,
                    timestamp: new Date()
                };
                addTweet(newTweet);
            });
        };

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
                overflow: "auto",
                borderLeft: 1,
                borderColor: "divider"
            }}>
                <Timeline tweets={tweets} />
            </Box>
        </Box>
    )
}
