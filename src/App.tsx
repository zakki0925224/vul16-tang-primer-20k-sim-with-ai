import { Box } from "@mui/material";
import { Simulator } from "./Simulator";
import { Timeline, type TweetData } from "./Timeline";
import { useState, useEffect, useRef } from "react";
import { Cpu } from "./cpu";
import * as Llm from "./llm";

const TIMER_INTERVAL_SEC = 30; // 30s

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
            let cpuStateText = "";
            if (cpu) {
                const regsText = cpu.gpRegs.map((v, i) => {
                    const hexValue = v.toString(16).padStart(4, "0");
                    return `r${i}=0x${hexValue}`;
                }).join(", ");
                const pcHex = cpu.pc.toString(16).padStart(4, "0");
                cpuStateText = `\n\n現在のCPU状態:\nPC: 0x${pcHex}\nレジスタ: ${regsText}`;
            }

            Llm.generateTextAsync(cpuStateText).then((text) => {
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
