import { Box } from "@mui/material";
import { Simulator } from "./Simulator";
import { useState, useEffect, useRef } from "react";
import { Cpu } from "./cpu";

const TIMER_INTERVAL_SEC = 10; // 10s
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
            if (!isCpuRunning)
                return;

            try {
                const cpu = cpuRef.current;
                if (!cpu)
                    return;

                const archived = cpu.flushArchivedHistory();

                const opcodeCounts: Record<string, number> = {};
                const regTrends: Record<number, { inc: number, dec: number }> = {};
                const memoryAccessCounts: Record<number, number> = {};
                let sequentialWriteCount = 0;
                let lastWriteAddr = -1;
                let executedInstructionsInPeriod = 0;

                for (const diff of archived) {
                    const count = diff.repeatCount || 1;
                    executedInstructionsInPeriod += count;

                    const op = diff.decoded.opcode;
                    opcodeCounts[op] = (opcodeCounts[op] || 0) + count;

                    for (const [reg, change] of diff.changedRegs.entries()) {
                        if (!regTrends[reg]) regTrends[reg] = { inc: 0, dec: 0 };
                        if (change.after > change.before) regTrends[reg].inc += count;
                        if (change.after < change.before) regTrends[reg].dec += count;
                    }

                    for (const w of diff.memoryWrites) {
                        memoryAccessCounts[w.addr] = (memoryAccessCounts[w.addr] || 0) + count;
                        if (lastWriteAddr !== -1 && Math.abs(w.addr - lastWriteAddr) === 1) {
                            sequentialWriteCount += count;
                        }
                        lastWriteAddr = w.addr;
                    }
                }

                const topOpcodes = Object.entries(opcodeCounts)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 5)
                    .map(([op, count]) => `${op}: ${Math.round(count / executedInstructionsInPeriod * 100)}%`);

                const hotSpots = Object.entries(memoryAccessCounts)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 3)
                    .map(([addr, count]) => `0x${Number(addr).toString(16)}: ${count} writes`);

                const memPattern = sequentialWriteCount > (executedInstructionsInPeriod / 10) ? "Sequential (Filling/Copying)" : "Random/Sparse";

                const lastDiff = cpu.history.at(-1);
                const isLooping = lastDiff && (lastDiff.loopId !== undefined || (lastDiff.repeatCount || 0) > 1);
                let loopContext = "No active loop";

                if (isLooping) {
                    const activeRegEntry = Object.entries(regTrends)
                        .sort(([, a], [, b]) => (b.inc + b.dec) - (a.inc + a.dec))[0];

                    if (activeRegEntry) {
                        const [reg, trend] = activeRegEntry;
                        const direction = trend.inc > trend.dec ? "Increasing" : "Decreasing";
                        loopContext = `Looping (Key: R${reg} ${direction})`;
                    } else {
                        loopContext = "Looping (Stable state)";
                    }
                }

                const summary = {
                    timestamp: new Date().toISOString(),
                    status: {
                        pc: cpu.pc,
                        totalInstructions: cpu.getTotalExecutedInstructions(),
                        instructionsPerSecond: Math.round(executedInstructionsInPeriod / TIMER_INTERVAL_SEC)
                    },
                    activity_last_10s: {
                        description: `Executed ${executedInstructionsInPeriod} instructions.`,
                        top_opcodes: topOpcodes,
                        memory_activity: {
                            writes: hotSpots.length > 0 ? `${hotSpots.join(", ")}` : "None",
                            pattern: hotSpots.length > 0 ? memPattern : "None"
                        },
                        loop_status: loopContext
                    },
                    recent_trace: cpu.history.slice(-10).map(diff => {
                        const op = diff.decoded.opcode;
                        const parts = [`[${op}]`];

                        if (diff.changedRegs.size > 0) {
                            const changes = Array.from(diff.changedRegs.entries())
                                .map(([r, c]) => `R${r}:${c.before}->${c.after}`);
                            parts.push(changes.join(" "));
                        }

                        if (diff.memoryWrites.length > 0) {
                            const writes = diff.memoryWrites.map(w => `Mem[0x${w.addr.toString(16)}]<-${w.after}`);
                            parts.push(writes.join(" "));
                        }

                        if (diff.repeatCount && diff.repeatCount > 1) {
                            parts.push(`(x${diff.repeatCount})`);
                        }
                        return parts.join(" ");
                    })
                };

                await fetch(ENGI_API_URL, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ content: JSON.stringify(summary) })
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
