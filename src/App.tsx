import { useEffect, useRef, useState, type DragEvent } from "react"
import { Cpu, type InstructionDecoded } from "./Cpu"
import Container from '@mui/material/Container'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Grid from '@mui/material/Grid'
import Typography from '@mui/material/Typography'

function App() {
    const cpuRef = useRef<Cpu | null>(null);
    const intervalRef = useRef<number | null>(null);
    const [running, setRunning] = useState(false);
    const [regs, setRegs] = useState<number[]>(Array(8).fill(0));
    const [pc, setPc] = useState<number>(0);
    const [decoded, setDecoded] = useState<InstructionDecoded | null>(null);
    const [loadedFile, setLoadedFile] = useState<{ name: string; size: number } | null>(null);

    useEffect(() => {
        cpuRef.current = new Cpu();
        setRegs([...cpuRef.current.gpRegs]);
        setPc(cpuRef.current.pc);

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
            intervalRef.current = null;
        }
    }, []);

    const stepOnce = () => {
        const cpu = cpuRef.current;
        if (!cpu)
            return;

        const inst = cpu.memory[cpu.pc] | (cpu.memory[(cpu.pc + 1) & 0xffff] << 8);
        const d = cpu.step(inst);
        setRegs([...cpu.gpRegs]);
        setPc(cpu.pc);
        setDecoded(d ?? null);
    }

    const start = () => {
        if (running)
            return;

        setRunning(true);
        intervalRef.current = window.setInterval(() => {
            const cpu = cpuRef.current;
            if (!cpu) return;

            const inst = cpu.memory[cpu.pc] | (cpu.memory[(cpu.pc + 1) & 0xffff] << 8);
            const d = cpu.step(inst);
            setRegs([...cpu.gpRegs]);
            setPc(cpu.pc);
            setDecoded(d ?? null);
        }, 50);
    }

    const handleDragOver = (e: DragEvent) => {
        e.preventDefault();
    }

    const handleDrop = (e: DragEvent) => {
        e.preventDefault();
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
            cpu.pc = 0;
            setRegs([...cpu.gpRegs]);
            setPc(cpu.pc);
            setDecoded(null);
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
        setRegs([...cpuRef.current.gpRegs]);
        setPc(cpuRef.current.pc);
        setDecoded(null);
    }

    return (
        <Container maxWidth="md" sx={{ mt: 4 }}>
            <Paper sx={{ p: 2 }} elevation={3}>
                <Typography variant="h5" gutterBottom>vul16-tang-primer-20k-sim</Typography>

                <Box sx={{ mb: 2 }}>
                    <Button variant="contained" onClick={stepOnce} sx={{ mr: 1 }}>Step</Button>
                    <Button variant="contained" onClick={start} disabled={running} sx={{ mr: 1 }}>Start</Button>
                    <Button variant="contained" onClick={stop} disabled={!running} sx={{ mr: 1 }}>Stop</Button>
                    <Button variant="outlined" onClick={reset}>Reset</Button>
                </Box>

                <Paper variant="outlined" sx={{ p: 2, mb: 2 }} onDragOver={handleDragOver} onDrop={handleDrop}>
                    <Typography variant="body2">Drag & drop a binary here to load to memory (address 0)</Typography>
                    {loadedFile && (
                        <Typography variant="caption">Loaded: {loadedFile.name} ({loadedFile.size} bytes)</Typography>
                    )}
                </Paper>

                <Grid container spacing={2}>
                    <Grid {...{ item: true, xs: 12, md: 6 }}>
                        <Paper sx={{ p: 2 }}>
                            <Typography variant="subtitle1">PC</Typography>
                            <Typography variant="body2">0x{pc.toString(16).padStart(4, "0")}</Typography>
                            <Box sx={{ mt: 1 }} />
                            <Typography variant="subtitle1">Registers</Typography>
                            {regs.map((v, i) => (
                                <Typography key={i} variant="body2">r{i}: 0x{v.toString(16).padStart(4, "0")}</Typography>
                            ))}
                        </Paper>
                    </Grid>

                    <Grid {...{ item: true, xs: 12, md: 6 }}>
                        <Paper sx={{ p: 2 }}>
                            <Typography variant="subtitle1">Last decoded</Typography>
                            {decoded ? (
                                <div>
                                    <Typography variant="body2">opcode: {decoded.opcode}</Typography>
                                    <Typography variant="body2">rd: {decoded.rd}</Typography>
                                    <Typography variant="body2">rs1: {decoded.rs1}</Typography>
                                    <Typography variant="body2">rs2: {decoded.rs2}</Typography>
                                    <Typography variant="body2">imm: {decoded.imm}</Typography>
                                </div>
                            ) : (
                                <Typography variant="body2">—</Typography>
                            )}
                        </Paper>
                    </Grid>
                </Grid>
            </Paper>
        </Container>
    )
}

export default App;
