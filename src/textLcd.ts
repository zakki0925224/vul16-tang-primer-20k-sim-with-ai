export const LCD_TEXT_WIDTH = 60;
export const LCD_TEXT_HEIGHT = 17;

export interface BufferInner {
    c: string;
    fg: string;
    bg: string;
}

function convertColor(n: number): string {
    switch (n) {
        case 0: return "#000000"; // black
        case 1: return "#0000ff"; // blue
        case 2: return "#00ff00"; // green
        case 3: return "#00ffff"; // cyan
        case 4: return "#ff0000"; // red
        case 5: return "#ff00ff"; // magenta
        case 6: return "#8b4513"; // brown
        case 7: return "#c0c0c0"; // light gray
        case 8: return "#808080"; // dark gray
        case 9: return "#87cefa"; // light blue
        case 10: return "#90ee90"; // light green
        case 11: return "#e0ffff"; // light cyan
        case 12: return "#ff7f7f"; // light red
        case 13: return "#ffb3ff"; // light magenta
        case 14: return "#ffff00"; // yellow
        case 15: return "#ffffff"; // white
        default: return "#000000";
    }
}

export class TextLcd {
    buffer: BufferInner[][];

    constructor() {
        this.buffer = Array.from({ length: LCD_TEXT_HEIGHT }, () =>
            Array.from({ length: LCD_TEXT_WIDTH }, () => ({
                c: " ",
                fg: "#000000",
                bg: "#000000",
            }))
        );
    }

    setAscii(x: number, y: number, c: string): void {
        if (x < 0 || x >= LCD_TEXT_WIDTH || y < 0 || y >= LCD_TEXT_HEIGHT) {
            throw new Error("Coordinates out of bounds");
        }

        this.buffer[y][x].c = c;
    }

    setFgBg(x: number, y: number, fg: number, bg: number): void {
        if (x < 0 || x >= LCD_TEXT_WIDTH || y < 0 || y >= LCD_TEXT_HEIGHT) {
            throw new Error("Coordinates out of bounds");
        }

        this.buffer[y][x].fg = convertColor(fg);
        this.buffer[y][x].bg = convertColor(bg);
    }
}
