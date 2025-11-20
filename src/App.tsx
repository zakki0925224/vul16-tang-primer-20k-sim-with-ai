import { Box } from "@mui/material";
import { Simulator } from "./Simulator";
import { useState, useEffect, useRef } from "react";
import { Cpu } from "./cpu";

const TIMER_INTERVAL_SEC = 1; // 1s
const ENGI_API_URL = "/log/";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function replacer(_key: any, value: any) {
    if (value instanceof Map) {
        return Object.fromEntries(value);
    } else {
        return value;
    }
}

export default function App() {
    const cpuRef = useRef<Cpu | null>(null);

    const [isCpuRunning, setIsCpuRunning] = useState(false);

    const handleRunningChange = (isRunning: boolean) => {
        setIsCpuRunning(isRunning);
    };

    useEffect(() => {
        // initialize cpu
        cpuRef.current = new Cpu();
    }, []);

    useEffect(() => {
        const sendLog = async () => {
            if (!isCpuRunning)
                return;

            try {
                const cpu = cpuRef.current;
                if (!cpu)
                    return;

                await fetch(ENGI_API_URL, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ content: JSON.stringify(cpu.gpRegs, replacer) })
                });
            } catch (error) {
                console.error("Error sending log:", error);
            }
        };

        const logTimer = setInterval(() => void sendLog(), TIMER_INTERVAL_SEC * 1000);

        return () => {
            clearInterval(logTimer);
        };
    }, [isCpuRunning]);

    return (
        <Box sx={{ display: "flex", height: "100vh", width: "100%" }}>
            <Simulator cpuRef={cpuRef} onRunningChange={handleRunningChange} />
        </Box>
    )
}
