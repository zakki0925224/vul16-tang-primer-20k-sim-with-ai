import { Box, Button, Chip, Container, FormControlLabel, FormGroup, Grid, Paper, Slider, Stack, Switch, Typography } from "@mui/material";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { Cpu, type InstructionDecoded } from "./cpu";
import type { BufferInner } from "./textLcd";

export function Simulator() {
    const cpuRef = useRef<Cpu | null>(null);
    const intervalRef = useRef<number | null>(null);
    const changedTimerRef = useRef<number | null>(null);
    const [running, setRunning] = useState(false);
    const runningRef = useRef<boolean>(false);
    const [execDelay, setExecDelay] = useState<number>(50);
    const execDelayRef = useRef<number>(execDelay);
    const [regs, setRegs] = useState<number[]>(Array(8).fill(0));
    const regsRef = useRef<number[]>(regs);
    const [changedRegs, setChangedRegs] = useState<number[]>([]);
    const [pc, setPc] = useState<number>(0);
    const [decoded, setDecoded] = useState<InstructionDecoded | null>(null);
    const [lastInst, setLastInst] = useState<number | null>(null);
    const [loadedFile, setLoadedFile] = useState<{ name: string; size: number } | null>(null);
    const [dragActive, setDragActive] = useState(false);
    const dragCounterRef = useRef(0);
    const dumpSize = 65536;

    const [lcdBuf, setLcdBuf] = useState<BufferInner[][] | null>(null);

    // button states (4 buttons). bit0 = button1 ... bit3 = button4
    const [buttons, setButtons] = useState<boolean[]>([false, false, false, false]);
    const buttonsRef = useRef<boolean[]>(buttons);

    const buttonsToByte = (bs: boolean[]) => {
        const b = bs.reduce((acc, b, i) => acc | (b ? (1 << i) : 0), 0) & 0x0f;
        return b;
    }

    const cloneLcdBuffer = (buf: BufferInner[][]) => buf.map(row => row.map(cell => ({ ...cell })));

    const stepOnce = () => {
        const cpu = cpuRef.current;
        if (!cpu)
            return;

        const inst = cpu.memory[cpu.pc] | (cpu.memory[(cpu.pc + 1) & 0xffff] << 8);
        const d = cpu.step(inst);
        setLastInst(inst);
        // detect changed registers
        const newRegs = [...cpu.gpRegs];
        const changed: number[] = [];
        for (let i = 0; i < newRegs.length; i++) {
            if (newRegs[i] !== regs[i]) changed.push(i);
        }
        if (changed.length > 0) {
            setChangedRegs(changed);
            if (changedTimerRef.current) {
                clearTimeout(changedTimerRef.current);
            }
            changedTimerRef.current = window.setTimeout(() => setChangedRegs([]), 600);
        }
        setRegs(newRegs);
        setPc(cpu.pc);
        setDecoded(d ?? null);
        setLcdBuf(cpu.textLcd ? cloneLcdBuffer(cpu.textLcd.buffer) : null);
    }

    const start = () => {
        if (running)
            return;
        setRunning(true);
    }

    const handleDragOver = (e: DragEvent) => {
        e.preventDefault();
    }

    const handleDragEnter = (e: DragEvent) => {
        e.preventDefault();
        dragCounterRef.current += 1;
        setDragActive(true);
    }

    const handleDragLeave = (e: DragEvent) => {
        e.preventDefault();
        dragCounterRef.current -= 1;
        if (dragCounterRef.current <= 0) {
            dragCounterRef.current = 0;
            setDragActive(false);
        }
    }

    const handleDrop = (e: DragEvent) => {
        e.preventDefault();
        dragCounterRef.current = 0;
        setDragActive(false);
        const files = e.dataTransfer?.files;
        if (!files || files.length === 0) return;
        const f = files[0];
        const reader = new FileReader();
        reader.onload = () => {
            const buf = reader.result as ArrayBuffer;
            const arr = new Uint8Array(buf);
            const cpu = cpuRef.current;
            if (!cpu) return;
            cpu.memory.fill(0);
            cpu.memory.set(arr, 0);
            cpu.memory[0xf002] = buttonsToByte(buttonsRef.current);
            cpu.pc = 0;
            setRegs([...cpu.gpRegs]);
            setPc(cpu.pc);
            setDecoded(null);
            setLastInst(null);
            setLcdBuf(cpu.textLcd ? cloneLcdBuffer(cpu.textLcd.buffer) : null);
            setLoadedFile({ name: f.name, size: arr.length });
        };
        reader.readAsArrayBuffer(f);
    }

    const stop = () => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        setRunning(false);
    }

    const reset = () => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        setRunning(false);

        cpuRef.current = new Cpu();
        if (cpuRef.current) {
            cpuRef.current.memory[0xf002] = buttonsToByte(buttonsRef.current);
        }
        setRegs([...cpuRef.current.gpRegs]);
        setChangedRegs([]);
        setPc(cpuRef.current.pc);
        setDecoded(null);
        setLastInst(null);
        setLcdBuf(cpuRef.current.textLcd ? cloneLcdBuffer(cpuRef.current.textLcd.buffer) : null);
        setLoadedFile(null);
    }

    useEffect(() => { buttonsRef.current = buttons; }, [buttons]);

    useEffect(() => {
        cpuRef.current = new Cpu();
        setRegs([...cpuRef.current.gpRegs]);
        setPc(cpuRef.current.pc);
        setLcdBuf(cloneLcdBuffer(cpuRef.current.textLcd.buffer));

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
            intervalRef.current = null;
        }
    }, []);

    // keep refs in sync with state
    useEffect(() => { runningRef.current = running; }, [running]);
    useEffect(() => { execDelayRef.current = execDelay; }, [execDelay]);
    useEffect(() => { regsRef.current = regs; }, [regs]);

    // manage interval: start/stop or restart when running/execDelay changes
    useEffect(() => {
        if (!running) {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
            return;
        }

        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }

        intervalRef.current = window.setInterval(() => {
            const cpu = cpuRef.current;
            if (!cpu) return;
            const inst = cpu.memory[cpu.pc] | (cpu.memory[(cpu.pc + 1) & 0xffff] << 8);
            const d = cpu.step(inst);
            setLastInst(inst);
            const newRegs = [...cpu.gpRegs];
            const changed: number[] = [];
            for (let i = 0; i < newRegs.length; i++) {
                if (newRegs[i] !== regsRef.current[i]) changed.push(i);
            }
            if (changed.length > 0) {
                setChangedRegs(changed);
                if (changedTimerRef.current) {
                    clearTimeout(changedTimerRef.current);
                }
                changedTimerRef.current = window.setTimeout(() => setChangedRegs([]), 600);
            }
            setRegs(newRegs);
            setPc(cpu.pc);
            setDecoded(d ?? null);
            setLcdBuf(cpu.textLcd ? cloneLcdBuffer(cpu.textLcd.buffer) : null);
        }, execDelayRef.current) as unknown as number;

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        }
    }, [running, execDelay]);

    return (
        <Container maxWidth={false} disableGutters sx={{ mt: 4, width: "100%", px: 2 }}>
            <Paper sx={{ p: 2 }} elevation={3}>
                <Typography variant="h5" gutterBottom>vul16-tang-primer-20k-sim-with-ai</Typography>

                <Box sx={{ mb: 2 }}>
                    <Button variant="contained" onClick={stepOnce} sx={{ mr: 1 }}>Step</Button>
                    <Button variant="contained" onClick={start} disabled={running} sx={{ mr: 1 }}>Start</Button>
                    <Button variant="contained" onClick={stop} disabled={!running} sx={{ mr: 1 }}>Stop</Button>
                    <Button variant="outlined" onClick={reset}>Reset</Button>
                    <Box sx={{ mt: 2, width: 300 }}>
                        <Typography variant="caption">Execution delay: {execDelay} ms</Typography>
                        <Slider value={execDelay} min={1} max={1000} step={10} onChange={(_, v) => setExecDelay(v)} aria-label="exec-delay" />
                    </Box>
                </Box>

                <Paper
                    variant="outlined"
                    sx={{
                        p: 2,
                        mb: 2,
                        borderStyle: "dashed",
                        borderWidth: 2,
                        transition: "background-color 120ms, border-color 120ms",
                        ...(dragActive ? { backgroundColor: "rgba(255,245,157,0.4)", borderColor: "#fdd835" } : { borderColor: "#bbb" })
                    }}
                    onDragOver={handleDragOver}
                    onDragEnter={handleDragEnter}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                >
                    <Stack direction="row" spacing={2} alignItems="center">
                        <Typography variant="body2">Drag & drop a binary here to load to memory</Typography>
                        {loadedFile && (
                            <Chip label={`${loadedFile.name} (${loadedFile.size} B)`} size="small" />
                        )}
                    </Stack>
                </Paper>

                <Grid container spacing={2}>
                    <Grid size={12}>
                        <Paper sx={{ p: 2, fontFamily: "monospace", height: "auto" }} variant="outlined">
                            <Typography variant="subtitle1">Memory dump</Typography>
                            <Box sx={{ mt: 1 }} />
                            <MemoryDump memory={() => cpuRef.current?.memory} pc={() => cpuRef.current?.pc ?? 0} size={dumpSize} />
                        </Paper>
                    </Grid>

                    <Grid size={6}>
                        <Paper sx={{ p: 2 }} variant="outlined">
                            <Typography variant="subtitle1">PC</Typography>
                            <Typography variant="body2">0x{pc.toString(16).padStart(4, "0")}</Typography>
                            <Box sx={{ mt: 1 }} />
                            <Typography variant="subtitle1">Registers</Typography>
                            <Box sx={{ mt: 1, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1 }}>
                                {regs.map((v, i) => {
                                    const isChanged = changedRegs.includes(i);
                                    return (
                                        <Box key={i} sx={{ p: 1, background: isChanged ? "#fff59d" : "transparent", borderRadius: 1, display: "flex", flexDirection: "column" }}>
                                            <Typography>r{i}</Typography>
                                            <div style={{ fontFamily: "monospace" }}>0x{v.toString(16).padStart(4, "0")}</div>
                                        </Box>
                                    );
                                })}
                            </Box>
                        </Paper>
                    </Grid>

                    <Grid size={6}>
                        <Paper sx={{ p: 2 }} variant="outlined">
                            <Typography variant="subtitle1">Last decoded</Typography>
                            {decoded ? (
                                <div>
                                    <Typography variant="body2">opcode: {decoded.opcode}</Typography>
                                    <Typography variant="body2">rd: {decoded.rd}</Typography>
                                    <Typography variant="body2">rs1: {decoded.rs1}</Typography>
                                    <Typography variant="body2">rs2: {decoded.rs2}</Typography>
                                    <Typography variant="body2">imm: {decoded.imm}</Typography>
                                    <Box sx={{ mt: 1 }} />
                                    <RenderDecodedTable inst={lastInst} decoded={decoded} />
                                </div>
                            ) : (
                                <Typography variant="body2">—</Typography>
                            )}
                        </Paper>
                    </Grid>

                    <Grid size={6}>
                        <Paper sx={{ p: 2, mt: 1 }} variant="outlined">
                            <Typography variant="subtitle1">Button simulation (MMIO 0xf002)</Typography>
                            <FormGroup>
                                <FormControlLabel control={<Switch checked={buttons[0]} onChange={(_, checked) => {
                                    setButtons(prev => {
                                        const n = [...prev]; n[0] = checked;
                                        // update ref and MMIO immediately to avoid timing issues
                                        buttonsRef.current = n;
                                        const cpu = cpuRef.current;
                                        if (cpu) {
                                            const v = buttonsToByte(n);
                                            cpu.memory[0xf002] = v;
                                        }
                                        return n;
                                    });
                                }} />} label="Button 1" />
                                <FormControlLabel control={<Switch checked={buttons[1]} onChange={(_, checked) => {
                                    setButtons(prev => {
                                        const n = [...prev]; n[1] = checked;
                                        buttonsRef.current = n;
                                        const cpu = cpuRef.current;
                                        if (cpu) {
                                            const v = buttonsToByte(n);
                                            cpu.memory[0xf002] = v;
                                        }
                                        return n;
                                    });
                                }} />} label="Button 2" />
                                <FormControlLabel control={<Switch checked={buttons[2]} onChange={(_, checked) => {
                                    setButtons(prev => {
                                        const n = [...prev]; n[2] = checked;
                                        buttonsRef.current = n;
                                        const cpu = cpuRef.current;
                                        if (cpu) {
                                            const v = buttonsToByte(n);
                                            cpu.memory[0xf002] = v;
                                        }
                                        return n;
                                    });
                                }} />} label="Button 3" />
                                <FormControlLabel control={<Switch checked={buttons[3]} onChange={(_, checked) => {
                                    setButtons(prev => {
                                        const n = [...prev]; n[3] = checked;
                                        buttonsRef.current = n;
                                        const cpu = cpuRef.current;
                                        if (cpu) {
                                            const v = buttonsToByte(n);
                                            cpu.memory[0xf002] = v;
                                        }
                                        return n;
                                    });
                                }} />} label="Button 4" />
                            </FormGroup>
                        </Paper>
                    </Grid>

                    <Grid size={6}>
                        <Paper sx={{ p: 2, mt: 1 }} variant="outlined">
                            <Typography variant="subtitle1">LCD simulation (MMIO 0xf004)</Typography>
                            <Box sx={{ mt: 1 }} />
                            {lcdBuf ? (
                                <TextLcdView buffer={lcdBuf} />
                            ) : (
                                <Typography variant="body2">No LCD data</Typography>
                            )}
                        </Paper>
                    </Grid>
                </Grid>
            </Paper>
        </Container>
    )
}

function TextLcdView({ buffer }: Readonly<{ buffer: BufferInner[][] }>) {
    return (
        <div style={{ fontFamily: "monospace", lineHeight: 1, overflow: "auto", maxHeight: 340 }}>
            {buffer.map((row, y) => (
                <div key={y} style={{ display: "flex" }}>
                    {row.map((cell, x) => (
                        <div key={x} style={{ width: 10, height: 18, display: "flex", alignItems: "center", justifyContent: "center", background: cell.bg, color: cell.fg }}>
                            {cell.c || " "}
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
}

function MemoryDump({ memory, pc, size }: Readonly<{ memory: () => Uint8Array | undefined, pc: () => number, size: number }>) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [scrollTop, setScrollTop] = useState(0);

    const mem = memory();
    if (!mem) return <Typography variant="body2">No memory</Typography>;

    const cols = 16;
    const rowHeight = 18;
    const totalRows = Math.ceil(size / cols);

    const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
        setScrollTop(e.currentTarget.scrollTop);
    };

    const visibleStartRow = Math.floor(scrollTop / rowHeight);
    const visibleRowCount = Math.ceil(300 / rowHeight) + 2;
    const from = Math.max(0, visibleStartRow - 1);
    const to = Math.min(totalRows, from + visibleRowCount + 2);

    const pcVal = pc() & 0xffff;

    const rows: React.ReactNode[] = [];
    for (let row = from; row < to; row++) {
        const addr = (row * cols) & 0xffff;
        const rowBytes: number[] = [];
        for (let j = 0; j < cols; j++) rowBytes.push(mem[(addr + j) & 0xffff]);

        const byteElems = rowBytes.map((b, j) => {
            const absoluteAddr = (addr + j) & 0xffff;
            const isPc = absoluteAddr === pcVal || absoluteAddr === ((pcVal + 1) & 0xffff);
            return (
                <span key={j} style={{
                    display: "inline-block",
                    minWidth: 20,
                    padding: "0 3px",
                    background: isPc ? "#fff59d" : "transparent",
                    color: b == 0 ? "#666" : "#002fffff",
                    borderRadius: 3
                }}>{b.toString(16).padStart(2, "0")}</span>
            );
        });

        rows.push(
            <div key={row} style={{ display: "grid", gridTemplateColumns: "60px repeat(16, 1fr)", gap: 8, height: rowHeight, alignItems: "center" }}>
                <div style={{ color: "#666", paddingLeft: 2 }}>{addr.toString(16).padStart(4, "0")}:</div>
                {byteElems.map((el, i) => (
                    <div key={i} style={{ textAlign: "center", fontFamily: "monospace" }}>{el}</div>
                ))}
            </div>
        );
    }

    const spacerHeight = totalRows * rowHeight;
    const translateY = from * rowHeight;

    return (
        <div ref={containerRef} onScroll={onScroll} style={{ height: 300, overflow: "auto", width: "100%" }}>
            <div style={{ height: spacerHeight, position: "relative", width: "100%" }}>
                <div style={{ position: "absolute", top: translateY, left: 0, right: 0, width: "100%" }}>{rows}</div>
            </div>
        </div>
    );
}

function RenderDecodedTable({ inst, decoded }: Readonly<{ inst: number | null, decoded: InstructionDecoded }>) {
    if (inst == null) return <Typography variant="body2">No instruction</Typography>;
    const bin = inst.toString(2).padStart(16, "0");

    const maybe = decoded as unknown as { format?: "R" | "I" | "J" | "B" };
    let fmt: "R" | "I" | "J" | "B" | null = maybe.format ?? null;
    if (!fmt) {
        if (decoded.rd !== 0 && decoded.rs1 !== 0 && decoded.rs2 !== 0) fmt = "R";
        else if (decoded.rs1 !== 0 && decoded.rd !== 0 && decoded.rs2 === 0) fmt = "I";
        else if (decoded.rd !== 0 && decoded.rs1 === 0) fmt = "J";
        else fmt = "B";
    }

    const cell = (label: string, span?: string) => (
        <td style={{ border: "1px solid #444", padding: 6, textAlign: "center" }}>{label}{span ? <div style={{ fontSize: 12, color: "#666" }}>{span}</div> : null}</td>
    );

    if (fmt === "R") {
        // opcode(15-11) rd(10-8) rs1(7-5) rs2(4-2) res(1-0)
        return (
            <table style={{ borderCollapse: "collapse", width: "100%", fontFamily: "monospace" }}>
                <tbody>
                    <tr>
                        {cell("opcode\n15-11")}
                        {cell("rd\n10-8")}
                        {cell("rs1\n7-5")}
                        {cell("rs2\n4-2")}
                        {cell("reserved\n1-0")}
                    </tr>
                    <tr>
                        <td style={{ border: "1px solid #444", padding: 6, textAlign: "center" }}>{bin.slice(0, 5)}</td>
                        <td style={{ border: "1px solid #444", padding: 6, textAlign: "center" }}>{bin.slice(5, 8)}</td>
                        <td style={{ border: "1px solid #444", padding: 6, textAlign: "center" }}>{bin.slice(8, 11)}</td>
                        <td style={{ border: "1px solid #444", padding: 6, textAlign: "center" }}>{bin.slice(11, 14)}</td>
                        <td style={{ border: "1px solid #444", padding: 6, textAlign: "center" }}>{bin.slice(14, 16)}</td>
                    </tr>
                </tbody>
            </table>
        );
    }

    if (fmt === "I") {
        // opcode(15-11) rd(10-8) rs1(7-5) imm(4-0)
        return (
            <table style={{ borderCollapse: "collapse", width: "100%", fontFamily: "monospace" }}>
                <tbody>
                    <tr>
                        {cell("opcode\n15-11")}
                        {cell("rd\n10-8")}
                        {cell("rs1\n7-5")}
                        {cell("imm\n4-0")}
                    </tr>
                    <tr>
                        <td style={{ border: "1px solid #444", padding: 6, textAlign: "center" }}>{bin.slice(0, 5)}</td>
                        <td style={{ border: "1px solid #444", padding: 6, textAlign: "center" }}>{bin.slice(5, 8)}</td>
                        <td style={{ border: "1px solid #444", padding: 6, textAlign: "center" }}>{bin.slice(8, 11)}</td>
                        <td style={{ border: "1px solid #444", padding: 6, textAlign: "center" }}>{bin.slice(11, 16)}</td>
                    </tr>
                </tbody>
            </table>
        );
    }

    if (fmt === "J") {
        // opcode(15-11) rd(10-8) offset(7-0)
        return (
            <table style={{ borderCollapse: "collapse", width: "100%", fontFamily: "monospace" }}>
                <tbody>
                    <tr>
                        {cell("opcode\n15-11")}
                        {cell("rd\n10-8")}
                        {cell("offset\n7-0")}
                    </tr>
                    <tr>
                        <td style={{ border: "1px solid #444", padding: 6, textAlign: "center" }}>{bin.slice(0, 5)}</td>
                        <td style={{ border: "1px solid #444", padding: 6, textAlign: "center" }}>{bin.slice(5, 8)}</td>
                        <td style={{ border: "1px solid #444", padding: 6, textAlign: "center" }}>{bin.slice(8, 16)}</td>
                    </tr>
                </tbody>
            </table>
        );
    }

    // B
    return (
        <table style={{ borderCollapse: "collapse", width: "100%", fontFamily: "monospace" }}>
            <tbody>
                <tr>
                    {cell("opcode\n15-11")}
                    {cell("rs1\n10-8")}
                    {cell("rs2\n7-5")}
                    {cell("offset\n4-0")}
                </tr>
                <tr>
                    <td style={{ border: "1px solid #444", padding: 6, textAlign: "center" }}>{bin.slice(0, 5)}</td>
                    <td style={{ border: "1px solid #444", padding: 6, textAlign: "center" }}>{bin.slice(5, 8)}</td>
                    <td style={{ border: "1px solid #444", padding: 6, textAlign: "center" }}>{bin.slice(8, 11)}</td>
                    <td style={{ border: "1px solid #444", padding: 6, textAlign: "center" }}>{bin.slice(11, 16)}</td>
                </tr>
            </tbody>
        </table>
    );
}
