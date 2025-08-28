import { LCD_TEXT_HEIGHT, LCD_TEXT_WIDTH, TextLcd } from "./TextLcd";

type Opcode =
    | "Add" | "Addi" | "Sub" | "And" | "Andi" | "Or" | "Ori" | "Xor" | "Xori" | "Sll" | "Slli" | "Srl" | "Srli" | "Sra" | "Srai" | "Slt" | "Slti" | "Sltu" | "Sltiu" | "Lb" | "Lbu" | "Lw" | "Sb" | "Sw" | "Jmp" | "Jmpr" | "Beq" | "Bne" | "Blt" | "Bge" | "Bltu" | "Bgeu";

type FormatType = "R" | "I" | "J" | "B";


const WORD_LEN = 16;
const BYTE_LEN = 8;
const NUM_GP_REGS = 8;
const START_ADDR = 0;
const MMIO_LCD_START_ADDR = 0xf004;
const MMIO_LCD_LEN = LCD_TEXT_WIDTH * LCD_TEXT_HEIGHT * 2;

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
    pc: number = START_ADDR;
    memory: Uint8Array = new Uint8Array(65536);
    textLcd: TextLcd = new TextLcd();

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
                this.memory[addr] = data;
                this.writeLcd(addr, data);
                this.pc += WORD_LEN / BYTE_LEN;
                break;
            }
            case "Sw": {
                const addr = (toU16(this.gpRegs[rs1]) + toS16(imm)) & 0xffff;
                const low = this.gpRegs[rd] & 0xff;
                const high = (this.gpRegs[rd] >> BYTE_LEN) & 0xff;
                this.memory[addr] = low;
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
}
