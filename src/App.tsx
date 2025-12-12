import { Box } from "@mui/material";
import { Simulator } from "./Simulator";
import { useState, useEffect, useRef } from "react";
import { Cpu } from "./cpu";

const TIMER_INTERVAL_SEC = 0.1;
const ENGI_API_URL = "/log/";

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
            if (!isCpuRunning) return;

            try {
                const cpu = cpuRef.current;
                if (!cpu) return;

                const cpuHistory = cpu.getHistory();
                console.log(cpuHistory);
                const history = cpuHistory.map((diff) => {
                    let result = `pc: 0x${diff.pc.toString(16)}, ${diff.disass}`;

                    if (diff.changedRegs.keys.length > 0) {
                        diff.changedRegs.forEach(({ before, after }, key) => {
                            result += `, r${key}: 0x${before.toString(16)} -> 0x${after.toString(16)}`;
                        });
                    }

                    if (diff.memWrites.keys.length > 0) {
                        diff.memWrites.forEach(({ before, after }, key) => {
                            result += `, M[0x${key.toString(16)}]: 0x${before.toString(16)} -> 0x${after.toString(16)}`;
                        });
                    }

                    return result;
                });

                await fetch(ENGI_API_URL, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ content: JSON.stringify(history) }),
                });
            } catch (error) {
                console.error("Error sending log:", error);
            }
        };

        const logTimer = setInterval(
            () => void sendLog(),
            TIMER_INTERVAL_SEC * 1000,
        );

        return () => {
            clearInterval(logTimer);
        };
    }, [isCpuRunning]);

    return (
        <Box sx={{ display: "flex", height: "100vh", width: "100%" }}>
            <Simulator cpuRef={cpuRef} onRunningChange={handleRunningChange} />
        </Box>
    );
}
