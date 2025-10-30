import { LCD_TEXT_HEIGHT, LCD_TEXT_WIDTH, TextLcd } from "./textLcd";

type Opcode =
    | "Add" | "Addi" | "Sub" | "And" | "Andi" | "Or" | "Ori" | "Xor" | "Xori" | "Sll" | "Slli" | "Srl" | "Srli" | "Sra" | "Srai" | "Slt" | "Slti" | "Sltu" | "Sltiu" | "Lb" | "Lbu" | "Lw" | "Sb" | "Sw" | "Jmp" | "Jmpr" | "Beq" | "Bne" | "Blt" | "Bge" | "Bltu" | "Bgeu";

type FormatType = "R" | "I" | "J" | "B";

const WORD_LEN = 16;
const BYTE_LEN = 8;
const NUM_GP_REGS = 8;
const START_ADDR = 0;
const MMIO_LCD_START_ADDR = 0xf004;
const MMIO_LCD_LEN = LCD_TEXT_WIDTH * LCD_TEXT_HEIGHT * 2;

export const CPU_MAX_HISTORY = 30;

function opcodeFromInst(inst: number): Opcode {
    const op = (inst & 0xf800) >> 11;
    switch (op) {
        case 0: return "Add";
        case 1: return "Addi";
        case 2: return "Sub";
        case 3: return "And";
        case 4: return "Andi";
        case 5: return "Or";
        case 6: return "Ori";
        case 7: return "Xor";
        case 8: return "Xori";
        case 9: return "Sll";
        case 10: return "Slli";
        case 11: return "Srl";
        case 12: return "Srli";
        case 13: return "Sra";
        case 14: return "Srai";
        case 15: return "Slt";
        case 16: return "Slti";
        case 17: return "Sltu";
        case 18: return "Sltiu";
        case 19: return "Lb";
        case 20: return "Lbu";
        case 21: return "Lw";
        case 22: return "Sb";
        case 23: return "Sw";
        case 24: return "Jmp";
        case 25: return "Jmpr";
        case 26: return "Beq";
        case 27: return "Bne";
        case 28: return "Blt";
        case 29: return "Bge";
        case 30: return "Bltu";
        case 31: return "Bgeu";
        default: throw new Error(`Unknown opcode: ${op}`);
    }
}

function formatTypeFromOpcode(opcode: Opcode): FormatType {
    switch (opcode) {
        case "Add":
        case "Sub":
        case "And":
        case "Or":
        case "Xor":
        case "Sll":
        case "Srl":
        case "Sra":
        case "Slt":
        case "Sltu":
            return "R";
        case "Addi":
        case "Andi":
        case "Ori":
        case "Xori":
        case "Slli":
        case "Srli":
        case "Srai":
        case "Slti":
        case "Sltiu":
        case "Lb":
        case "Lbu":
        case "Lw":
        case "Sb":
        case "Sw":
        case "Jmpr":
            return "I";
        case "Jmp":
            return "J";
        case "Beq":
        case "Bne":
        case "Blt":
        case "Bge":
        case "Bltu":
        case "Bgeu":
            return "B";
    }
}

function signExtend(value: number, fromWidth: number, toWidth: number): number {
    const sign = (value >> (fromWidth - 1)) & 1;
    const ext = sign ? ((1 << (toWidth - fromWidth)) - 1) << fromWidth : 0;
    return ext | value;
}

function toS16(x: number): number { return (x << 16) >> 16; }
function toU16(x: number): number { return x & 0xffff; }
function shamt5(x: number): number { return x & 0x1f; }

export interface CpuStateDiff {
    pc: number;
    inst: number;
    decoded: InstructionDecoded;
    changedRegs: Map<number, { before: number; after: number }>;
    memoryWrites: Array<{ addr: number; before: number; after: number }>;
    repeatCount?: number;
    loopId?: number;
    isLoopStart?: boolean;
    isLoopEnd?: boolean;
}

interface LoopPattern {
    startPc: number;
    endPc: number;
    instructions: number[];
    repeatCount: number;
    firstDiffIndex: number;
}

export interface InstructionDecoded {
    opcode: Opcode;
    format: FormatType,
    rd: number;
    rs1: number;
    rs2: number;
    imm: number;
}

export class Cpu {
    gpRegs: number[] = Array(NUM_GP_REGS).fill(0);
    private prevGpRegs: number[] = Array(NUM_GP_REGS).fill(0);

    memory: Uint8Array = new Uint8Array(65536);
    private memoryWrites: Array<{ addr: number; before: number; after: number }> = [];

    pc: number = START_ADDR;
    textLcd: TextLcd = new TextLcd();

    history: CpuStateDiff[] = [];
    archivedHistory: CpuStateDiff[] = [];
    private executionTrace: number[] = [];
    private readonly maxTraceLength: number = 1000;
    private readonly detectedLoops: Map<number, LoopPattern> = new Map();
    private currentLoopId: number = 0;
    private lastCompressedLoopId: number = -1;

    decode(inst: number): InstructionDecoded {
        const opcode = opcodeFromInst(inst);
        const format = formatTypeFromOpcode(opcode);

        switch (format) {
            case "R": return {
                opcode,
                format,
                rd: (inst & 0x0700) >> 8,
                rs1: (inst & 0x00e0) >> 5,
                rs2: (inst & 0x001c) >> 2,
                imm: 0
            }
            case "I": return {
                opcode,
                format,
                rd: (inst & 0x0700) >> 8,
                rs1: (inst & 0x00e0) >> 5,
                rs2: 0,
                imm: (() => {
                    const raw5 = (inst & 0x001f);
                    switch (opcode) {
                        case "Andi":
                        case "Ori":
                        case "Xori":
                        case "Sltiu":
                        case "Slli":
                        case "Srli":
                        case "Srai":
                            return raw5;
                        default:
                            return signExtend(raw5, 5, WORD_LEN);
                    }
                })()
            }
            case "J": return {
                opcode,
                format,
                rd: (inst & 0x0700) >> 8,
                rs1: 0,
                rs2: 0,
                imm: signExtend((inst & 0x00ff), 8, WORD_LEN)
            }
            case "B": return {
                opcode,
                format,
                rd: 0,
                rs1: (inst & 0x0700) >> 8,
                rs2: (inst & 0x00e0) >> 5,
                imm: signExtend((inst & 0x001f), 5, WORD_LEN)
            }
        }
    }

    step(inst: number): InstructionDecoded {
        const prevPc = this.pc;
        this.prevGpRegs = [...this.gpRegs];
        this.memoryWrites = [];

        this.executionTrace.push(prevPc);
        if (this.executionTrace.length > this.maxTraceLength) {
            this.executionTrace.shift();
        }

        const decoded = this.decode(inst);
        const { opcode, rd, rs1, rs2, imm } = decoded;

        switch (opcode) {
            case "Add": {
                const _rs1 = toS16(this.gpRegs[rs1]);
                const _rs2 = toS16(this.gpRegs[rs2]);
                this.gpRegs[rd] = (_rs1 + _rs2) & 0xffff;
                this.pc += WORD_LEN / BYTE_LEN;
                break;
            }
            case "Addi": {
                const _rs1 = toS16(this.gpRegs[rs1]);
                const _imm = toS16(imm);
                this.gpRegs[rd] = (_rs1 + _imm) & 0xffff;
                this.pc += WORD_LEN / BYTE_LEN;
                break;
            }
            case "Sub": {
                const _rs1 = toS16(this.gpRegs[rs1]);
                const _rs2 = toS16(this.gpRegs[rs2]);
                this.gpRegs[rd] = (_rs1 - _rs2) & 0xffff;
                this.pc += WORD_LEN / BYTE_LEN;
                break;
            }
            case "And": {
                const _rs1 = toU16(this.gpRegs[rs1]);
                const _rs2 = toU16(this.gpRegs[rs2]);
                this.gpRegs[rd] = (_rs1 & _rs2) & 0xffff;
                this.pc += WORD_LEN / BYTE_LEN;
                break;
            }
            case "Andi": {
                const _rs1 = toU16(this.gpRegs[rs1]);
                this.gpRegs[rd] = (_rs1 & toU16(imm)) & 0xffff;
                this.pc += WORD_LEN / BYTE_LEN;
                break;
            }
            case "Or": {
                const _rs1 = toU16(this.gpRegs[rs1]);
                const _rs2 = toU16(this.gpRegs[rs2]);
                this.gpRegs[rd] = (_rs1 | _rs2) & 0xffff;
                this.pc += WORD_LEN / BYTE_LEN;
                break;
            }
            case "Ori": {
                const _rs1 = toU16(this.gpRegs[rs1]);
                this.gpRegs[rd] = (_rs1 | toU16(imm)) & 0xffff;
                this.pc += WORD_LEN / BYTE_LEN;
                break;
            }
            case "Xor": {
                const _rs1 = toU16(this.gpRegs[rs1]);
                const _rs2 = toU16(this.gpRegs[rs2]);
                this.gpRegs[rd] = (_rs1 ^ _rs2) & 0xffff;
                this.pc += WORD_LEN / BYTE_LEN;
                break;
            }
            case "Xori": {
                const _rs1 = toU16(this.gpRegs[rs1]);
                this.gpRegs[rd] = (_rs1 ^ toU16(imm)) & 0xffff;
                this.pc += WORD_LEN / BYTE_LEN;
                break;
            }
            case "Sll": {
                const _rs1 = toU16(this.gpRegs[rs1]);
                const _rs2 = shamt5(this.gpRegs[rs2]);
                this.gpRegs[rd] = (_rs1 << _rs2) & 0xffff;
                this.pc += WORD_LEN / BYTE_LEN;
                break;
            }
            case "Slli": {
                const _rs1 = toU16(this.gpRegs[rs1]);
                const _imm = shamt5(imm);
                this.gpRegs[rd] = (_rs1 << _imm) & 0xffff;
                this.pc += WORD_LEN / BYTE_LEN;
                break;
            }
            case "Srl": {
                const _rs1 = toU16(this.gpRegs[rs1]);
                const _rs2 = shamt5(this.gpRegs[rs2]);
                this.gpRegs[rd] = (_rs1 >>> _rs2) & 0xffff;
                this.pc += WORD_LEN / BYTE_LEN;
                break;
            }
            case "Srli": {
                const _rs1 = toU16(this.gpRegs[rs1]);
                const _imm = shamt5(imm);
                this.gpRegs[rd] = (_rs1 >>> _imm) & 0xffff;
                this.pc += WORD_LEN / BYTE_LEN;
                break;
            }
            case "Sra": {
                const _rs1 = toS16(this.gpRegs[rs1]);
                const _rs2 = shamt5(this.gpRegs[rs2]);
                this.gpRegs[rd] = (_rs1 >> _rs2) & 0xffff;
                this.pc += WORD_LEN / BYTE_LEN;
                break;
            }
            case "Srai": {
                const _rs1 = toS16(this.gpRegs[rs1]);
                const _imm = shamt5(imm);
                this.gpRegs[rd] = (_rs1 >> _imm) & 0xffff;
                this.pc += WORD_LEN / BYTE_LEN;
                break;
            }
            case "Slt": {
                const a = toS16(this.gpRegs[rs1]);
                const b = toS16(this.gpRegs[rs2]);
                this.gpRegs[rd] = (a < b ? 1 : 0) & 0xffff;
                this.pc += WORD_LEN / BYTE_LEN;
                break;
            }
            case "Slti": {
                const a = toS16(this.gpRegs[rs1]);
                const b = toS16(imm);
                this.gpRegs[rd] = (a < b ? 1 : 0) & 0xffff;
                this.pc += WORD_LEN / BYTE_LEN;
                break;
            }
            case "Sltu": {
                const a = toU16(this.gpRegs[rs1]);
                const b = toU16(this.gpRegs[rs2]);
                this.gpRegs[rd] = (a < b ? 1 : 0) & 0xffff;
                this.pc += WORD_LEN / BYTE_LEN;
                break;
            }
            case "Sltiu": {
                const a = toU16(this.gpRegs[rs1]);
                const b = toU16(imm);
                this.gpRegs[rd] = (a < b ? 1 : 0) & 0xffff;
                this.pc += WORD_LEN / BYTE_LEN;
                break;
            }
            case "Lb": {
                const addr = (toU16(this.gpRegs[rs1]) + toS16(imm)) & 0xffff;
                this.gpRegs[rd] = signExtend(this.memory[addr], 8, WORD_LEN) & 0xffff;
                this.pc += WORD_LEN / BYTE_LEN;
                break;
            }
            case "Lbu": {
                const addr = (toU16(this.gpRegs[rs1]) + toS16(imm)) & 0xffff;
                this.gpRegs[rd] = this.memory[addr] & 0xffff;
                this.pc += WORD_LEN / BYTE_LEN;
                break;
            }
            case "Lw": {
                const addr = (toU16(this.gpRegs[rs1]) + toS16(imm)) & 0xffff;
                const low = this.memory[addr];
                const high = this.memory[(addr + 1) & 0xffff];
                this.gpRegs[rd] = (low | (high << BYTE_LEN)) & 0xffff;
                this.pc += WORD_LEN / BYTE_LEN;
                break;
            }
            case "Sb": {
                const addr = (toU16(this.gpRegs[rs1]) + toS16(imm)) & 0xffff;
                const data = this.gpRegs[rd] & 0xff;
                this.memoryWrites.push({ addr, before: this.memory[addr], after: data });
                this.memory[addr] = data;
                this.writeLcd(addr, data);
                this.pc += WORD_LEN / BYTE_LEN;
                break;
            }
            case "Sw": {
                const addr = (toU16(this.gpRegs[rs1]) + toS16(imm)) & 0xffff;
                const low = this.gpRegs[rd] & 0xff;
                const high = (this.gpRegs[rd] >> BYTE_LEN) & 0xff;

                this.memoryWrites.push({ addr, before: this.memory[addr], after: low });
                this.memory[addr] = low;
                this.memoryWrites.push({ addr: (addr + 1) & 0xffff, before: this.memory[(addr + 1) & 0xffff], after: high });
                this.memory[(addr + 1) & 0xffff] = high;
                this.writeLcd(addr, low);
                this.writeLcd((addr + 1) & 0xffff, high);
                this.pc += WORD_LEN / BYTE_LEN;
                break;
            }
            case "Jmp": {
                this.gpRegs[rd] = (this.pc + (WORD_LEN / BYTE_LEN)) & 0xffff;
                this.pc = (toU16(this.pc) + toS16(imm)) & 0xffff;
                break;
            }
            case "Jmpr": {
                this.gpRegs[rd] = (this.pc + (WORD_LEN / BYTE_LEN)) & 0xffff;
                this.pc = ((toU16(this.gpRegs[rs1]) + toS16(imm)) & 0xffff) & ~1;
                break;
            }
            case "Beq": {
                const a = toU16(this.gpRegs[rs1]);
                const b = toU16(this.gpRegs[rs2]);
                if (a === b) {
                    this.pc = toU16(this.pc) + toS16(imm);
                }
                else {
                    this.pc += WORD_LEN / BYTE_LEN;
                }
                break;
            }
            case "Bne": {
                const a = toU16(this.gpRegs[rs1]);
                const b = toU16(this.gpRegs[rs2]);
                if (a !== b) {
                    this.pc = toU16(this.pc) + toS16(imm);
                }
                else {
                    this.pc += WORD_LEN / BYTE_LEN;
                }
                break;
            }
            case "Blt": {
                const a = toS16(this.gpRegs[rs1]);
                const b = toS16(this.gpRegs[rs2]);
                if (a < b) {
                    this.pc = toU16(this.pc) + toS16(imm);
                }
                else {
                    this.pc += WORD_LEN / BYTE_LEN;
                }
                break;
            }
            case "Bge": {
                const a = toS16(this.gpRegs[rs1]);
                const b = toS16(this.gpRegs[rs2]);
                if (a >= b) {
                    this.pc = toU16(this.pc) + toS16(imm);
                }
                else {
                    this.pc += WORD_LEN / BYTE_LEN;
                }
                break;
            }
            case "Bltu": {
                const a = toU16(this.gpRegs[rs1]);
                const b = toU16(this.gpRegs[rs2]);
                if (a < b) {
                    this.pc = toU16(this.pc) + toS16(imm);
                }
                else {
                    this.pc += WORD_LEN / BYTE_LEN;
                }
                break;
            }
            case "Bgeu": {
                const a = toU16(this.gpRegs[rs1]);
                const b = toU16(this.gpRegs[rs2]);
                if (a >= b) {
                    this.pc = toU16(this.pc) + toS16(imm);
                }
                else {
                    this.pc += WORD_LEN / BYTE_LEN;
                }
                break;
            }
        }

        this.gpRegs[0] = 0;
        this.pc &= 0xffff;

        this.recordDiff(prevPc, inst, decoded);

        if (this.pc <= prevPc) {
            this.detectLoop();
        }

        return decoded;
    }

    writeLcd(addr: number, data: number): void {
        if (addr >= MMIO_LCD_START_ADDR && addr < MMIO_LCD_START_ADDR + MMIO_LCD_LEN) {
            const rel = (addr - MMIO_LCD_START_ADDR) & 0xffff;
            const offset = Math.floor(rel / 2);
            const isWriteAscii = (rel % 2) === 0;
            const x = offset % LCD_TEXT_WIDTH;
            const y = Math.floor(offset / LCD_TEXT_WIDTH);

            // ignore out-of-range coordinates
            if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= LCD_TEXT_WIDTH || y < 0 || y >= LCD_TEXT_HEIGHT) {
                return;
            }

            if (isWriteAscii) {
                // use only lower 8 bits as ASCII
                this.textLcd.setAscii(x, y, String.fromCharCode(data & 0xff));
            } else {
                const bg = (data >> 4) & 0x0f;
                const fg = data & 0x0f;
                this.textLcd.setFgBg(x, y, fg, bg);
            }
        }
    }

    private recordDiff(prevPc: number, inst: number, decoded: InstructionDecoded) {
        const changedRegs = new Map<number, { before: number; after: number }>();
        for (let i = 0; i < NUM_GP_REGS; i++) {
            if (this.gpRegs[i] !== this.prevGpRegs[i]) {
                changedRegs.set(i, { before: this.prevGpRegs[i], after: this.gpRegs[i] });
            }
        }

        const diff: CpuStateDiff = {
            pc: prevPc,
            inst,
            decoded,
            changedRegs,
            memoryWrites: this.memoryWrites.map(w => ({ ...w })), // shallow copy
            repeatCount: 1
        };

        let canMerge = false;
        if (this.history.length > 0) {
            const last = this.history[this.history.length - 1];
            if (!last.isLoopStart && !last.isLoopEnd) {
                canMerge = this.canMerge(last, diff);
                if (canMerge) {
                    last.repeatCount = (last.repeatCount || 1) + 1;
                }
            }
        }

        if (!canMerge) {
            this.history.push(diff);

            if (this.history.length >= CPU_MAX_HISTORY) {
                this.compressOldestLoop();
                if (this.history.length >= CPU_MAX_HISTORY) {
                    const removed = this.history.shift();
                    if (removed) {
                        this.archivedHistory.push(removed);
                    }
                }
            }
        }
    }

    private canMerge(prev: CpuStateDiff, current: CpuStateDiff): boolean {
        if (prev.inst !== current.inst) {
            return false;
        }

        if (prev.pc + (WORD_LEN / BYTE_LEN) !== current.pc) {
            return false;
        }

        if (prev.changedRegs.size !== current.changedRegs.size) {
            return false;
        }

        for (const [reg, change] of current.changedRegs) {
            const prevChange = prev.changedRegs.get(reg);
            if (!prevChange) {
                return false;
            }

            if (prevChange.after !== change.before) {
                return false;
            }
        }

        if (prev.memoryWrites.length !== current.memoryWrites.length) {
            return false;
        }

        for (let i = 0; i < current.memoryWrites.length; i++) {
            const prevWrite = prev.memoryWrites[i];
            const currWrite = current.memoryWrites[i];

            if (prevWrite.addr !== currWrite.addr) {
                return false;
            }
        }

        return true;
    }

    private detectLoop(): void {
        const trace = this.executionTrace;
        if (trace.length < 4) return;

        const lastPc = trace[trace.length - 1];
        const positions: number[] = [];

        for (let i = trace.length - 2; i >= Math.max(0, trace.length - 100); i--) {
            if (trace[i] === lastPc) {
                positions.push(i);
            }
        }

        if (positions.length === 0) return;

        const loopLength = trace.length - 1 - positions[0];
        if (loopLength < 2 || loopLength > 50) return;

        let isLoop = true;
        for (let i = 0; i < loopLength && isLoop; i++) {
            const pos1 = trace.length - 1 - i;
            const pos2 = positions[0] - i;
            if (pos2 < 0 || trace[pos1] !== trace[pos2]) {
                isLoop = false;
            }
        }

        if (!isLoop) return;

        let repeatCount = 1;
        for (let i = 1; i < positions.length; i++) {
            const expectedPos = positions[0] - loopLength * i;
            if (positions[i] === expectedPos) {
                repeatCount++;
            } else {
                break;
            }
        }

        if (repeatCount >= 3) {
            const startPc = trace[positions[repeatCount - 1]];
            const endPc = lastPc;

            if (this.lastCompressedLoopId >= 0) {
                const lastLoop = this.detectedLoops.get(this.lastCompressedLoopId);
                if (lastLoop && lastLoop.startPc === startPc && lastLoop.endPc === endPc) {
                    return;
                }
            }

            const instructions: number[] = [];
            for (let i = 0; i < loopLength; i++) {
                const pcIdx = trace.length - loopLength + i;
                if (pcIdx >= 0 && pcIdx < trace.length) {
                    instructions.push(trace[pcIdx]);
                }
            }

            const loopId = this.currentLoopId++;
            const loopPattern: LoopPattern = {
                startPc,
                endPc,
                instructions,
                repeatCount,
                firstDiffIndex: this.history.length - loopLength * repeatCount
            };

            this.detectedLoops.set(loopId, loopPattern);
            this.compressLoopInHistory(loopPattern, loopId);
            this.lastCompressedLoopId = loopId;
        }
    } private compressLoopInHistory(loop: LoopPattern, loopId: number): void {
        const loopLength = loop.instructions.length;
        const totalEntries = loopLength * loop.repeatCount;
        const startIdx = Math.max(0, this.history.length - totalEntries);

        if (startIdx >= this.history.length || totalEntries > this.history.length) return;

        const loopEntries = this.history.splice(startIdx, totalEntries);
        this.archivedHistory.push(...loopEntries);

        if (loopEntries.length >= loopLength) {
            const oneCycle = loopEntries.slice(0, loopLength);

            if (oneCycle.length > 0) {
                oneCycle[0].isLoopStart = true;
                oneCycle[0].loopId = loopId;
                oneCycle[0].repeatCount = loop.repeatCount;

                oneCycle[oneCycle.length - 1].isLoopEnd = true;
                oneCycle[oneCycle.length - 1].loopId = loopId;
            }

            this.history.push(...oneCycle);
        } else {
            this.history.push(...loopEntries);
        }
    }

    private compressOldestLoop(): void {
        if (this.history.length < 10) return;

        for (let loopLen = 2; loopLen <= Math.min(10, Math.floor(this.history.length / 3)); loopLen++) {
            let repeatCount = 0;

            for (let offset = 0; offset + loopLen <= this.history.length; offset += loopLen) {
                const cycleMatch = this.historyCyclesMatch(offset, offset + loopLen, loopLen);
                if (cycleMatch) {
                    repeatCount++;
                } else {
                    break;
                }
            }

            if (repeatCount >= 3) {
                const oneCycle = this.history.splice(0, loopLen);
                this.archivedHistory.push(...oneCycle);
                if (oneCycle.length > 0) {
                    oneCycle[0].isLoopStart = true;
                    oneCycle[0].loopId = this.currentLoopId;
                    oneCycle[0].repeatCount = repeatCount;
                    oneCycle[oneCycle.length - 1].isLoopEnd = true;
                    oneCycle[oneCycle.length - 1].loopId = this.currentLoopId;

                    for (let i = 1; i < repeatCount; i++) {
                        const removed = this.history.splice(0, loopLen);
                        if (removed.length > 0) {
                            this.archivedHistory.push(...removed);
                        }
                    }

                    this.history.unshift(...oneCycle);
                    this.currentLoopId++;
                }
                return;
            }
        }
    }

    private historyCyclesMatch(start1: number, start2: number, length: number): boolean {
        if (start2 + length > this.history.length) return false;

        for (let i = 0; i < length; i++) {
            const entry1 = this.history[start1 + i];
            const entry2 = this.history[start2 + i];

            if (entry1.pc !== entry2.pc || entry1.inst !== entry2.inst) {
                return false;
            }

            if (entry1.decoded.opcode !== entry2.decoded.opcode) {
                return false;
            }
        }

        return true;
    }

    getLoopStatistics(): Array<{ loopId: number; startPc: number; endPc: number; length: number; repeatCount: number }> {
        const stats: Array<{ loopId: number; startPc: number; endPc: number; length: number; repeatCount: number }> = [];
        this.detectedLoops.forEach((loop, loopId) => {
            stats.push({
                loopId,
                startPc: loop.startPc,
                endPc: loop.endPc,
                length: loop.instructions.length,
                repeatCount: loop.repeatCount
            });
        });
        return stats;
    }

    getTotalExecutedInstructions(): number {
        let total = 0;
        for (const diff of this.history) {
            total += (diff.repeatCount || 1);
        }
        return total;
    }

    clearHistory(): void {
        this.history = [];
        this.archivedHistory = [];
        this.executionTrace = [];
        this.detectedLoops.clear();
        this.currentLoopId = 0;
        this.lastCompressedLoopId = -1;
    }
}
