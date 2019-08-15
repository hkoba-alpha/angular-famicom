import { IFamROM, IFamPPU, PPUConfig2000, PPUConfig2001, PPUState } from "./fam-api";
import { FamRequestMsg, FamResponseMsg } from "./fam-msg";

const famPaletteRGB = [0x75, 0x75, 0x75,
    0x27, 0x1B, 0x8F, 0x00, 0x00, 0xAB,
    0x47, 0x00, 0x9F, 0x8F, 0x00, 0x77,
    0xAB, 0x00, 0x13, 0xA7, 0x00, 0x00,
    0x7F, 0x0B, 0x00, 0x43, 0x2F, 0x00,
    0x00, 0x47, 0x00, 0x00, 0x51, 0x00,
    0x00, 0x3F, 0x17, 0x1B, 0x3F, 0x5F,
    0x00, 0x00, 0x00, 0x05, 0x05, 0x05,
    0x05, 0x05, 0x05,

    0xBC, 0xBC, 0xBC, 0x00, 0x73, 0xEF,
    0x23, 0x3B, 0xEF, 0x83, 0x00, 0xF3,
    0xBF, 0x00, 0xBF, 0xE7, 0x00, 0x5B,
    0xDB, 0x2B, 0x00, 0xCB, 0x4F, 0x0F,
    0x8B, 0x73, 0x00, 0x00, 0x97, 0x00,
    0x00, 0xAB, 0x00, 0x00, 0x93, 0x3B,
    0x00, 0x83, 0x8B, 0x11, 0x11, 0x11,
    0x09, 0x09, 0x09, 0x09, 0x09, 0x09,

    0xFF, 0xFF, 0xFF, 0x3F, 0xBF, 0xFF,
    0x5F, 0x97, 0xFF, 0xA7, 0x8B, 0xFD,
    0xF7, 0x7B, 0xFF, 0xFF, 0x77, 0xB7,
    0xFF, 0x77, 0x63, 0xFF, 0x9B, 0x3B,
    0xF3, 0xBF, 0x3F, 0x83, 0xD3, 0x13,
    0x4F, 0xDF, 0x4B, 0x58, 0xF8, 0x98,
    0x00, 0xEB, 0xDB, 0x66, 0x66, 0x66,
    0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D,

    0xFF, 0xFF, 0xFF, 0xAB, 0xE7, 0xFF,
    0xC7, 0xD7, 0xFF, 0xD7, 0xCB, 0xFF,
    0xFF, 0xC7, 0xFF, 0xFF, 0xC7, 0xDB,
    0xFF, 0xBF, 0xB3, 0xFF, 0xDB, 0xAB,
    0xFF, 0xE7, 0xA3, 0xE3, 0xFF, 0xA3,
    0xAB, 0xF3, 0xBF, 0xB3, 0xFF, 0xCF,
    0x9F, 0xFF, 0xF3, 0xDD, 0xDD, 0xDD,
    0x11, 0x11, 0x11, 0x11, 0x11, 0x11];

/*
[
    124, 124, 124,
    0, 0, 252,
    0, 0, 188,
    68, 40, 188,
    148, 0, 132,
    168, 0, 32,
    168, 16, 0,
    136, 20, 0,
    80, 48, 0,
    0, 120, 0,
    0, 104, 0,
    0, 88, 0,
    0, 64, 88,
    0, 0, 0,
    0, 0, 0,
    0, 0, 0,
    188, 188, 188,
    0, 120, 248,
    0, 88, 248,
    104, 68, 252,
    216, 0, 204,
    228, 0, 88,
    248, 56, 0,
    228, 92, 16,
    172, 124, 0,
    0, 184, 0,
    0, 168, 0,
    0, 168, 68,
    0, 136, 136,
    0, 0, 0,
    0, 0, 0,
    0, 0, 0,
    248, 248, 248,
    60, 188, 252,
    104, 136, 252,
    152, 120, 248,
    248, 120, 248,
    248, 88, 152,
    248, 120, 88,
    252, 160, 68,
    248, 184, 0,
    184, 248, 24,
    88, 216, 84,
    88, 248, 152,
    0, 232, 216,
    120, 120, 120,
    0, 0, 0,
    0, 0, 0,
    252, 252, 252,
    164, 228, 252,
    184, 184, 248,
    216, 184, 248,
    248, 184, 248,
    248, 164, 192,
    240, 208, 176,
    252, 224, 168,
    248, 216, 120,
    216, 248, 120,
    184, 248, 184,
    184, 248, 216,
    0, 252, 252,
    248, 216, 248,
    0, 0, 0,
    0, 0, 0
];*/

class FamPPUImpl implements IFamPPU {
    // 0000-0FFF, 1000-1FFF
    private pattern: Uint8Array[];

    // 2000-23FF(2000-23BF,23C0-23FF), 2400-27FF, 2800-2BFF, 2C00-2FFF
    private nameTable: Uint8Array[];

    // 3F00-3F0F,3F10-3F1F
    private palette: Uint8Array;

    private config2000: PPUConfig2000;
    private config2001: PPUConfig2001;
    private state: PPUState;

    private scrollX: number;
    private scrollY: number;

    private spriteBuf: Uint8Array = new Uint8Array(256);

    private spriteTable: Uint8Array = new Uint8Array(256);

    private rgbColor: Uint32Array;
    private lastBgColor: number = -1;

    private nextSpriteHit: boolean;

    constructor(private mode: "vertical" | "horizontal" | "four" = "vertical") {
        this.reset();
    }
    setMirrorMode(mode: "vertical" | "horizontal" | "four"): void {
        this.mode = mode;
        this.reset();
    }

    public reset(): void {
        this.config2000 = {
            bgPattern: 0,
            spritePattern: 0,
            nameTable: 0,
            spriteSize: 0
        };
        this.config2001 = {
            bg: false,
            sprite: false,
            bgMask: 0,
            spriteMask: 0,
            bgColor: 0
        };
        this.pattern = [new Uint8Array(0x1000), new Uint8Array(0x1000)];
        this.nameTable = [new Uint8Array(0x400), null, null, new Uint8Array(0x400)];
        if (this.mode == "vertical") {
            // 垂直ミラー
            this.nameTable[1] = this.nameTable[3];
            this.nameTable[2] = this.nameTable[0];
        } else if (this.mode == "horizontal") {
            // 水平ミラー
            this.nameTable[1] = this.nameTable[0];
            this.nameTable[2] = this.nameTable[3];
        } else {
            // ４画面
            this.nameTable[1] = new Uint8Array(0x400);
            this.nameTable[2] = new Uint8Array(0x400);
        }
        this.palette = new Uint8Array(0x20);
        this.state = {
            scanSprite: 0,
            spriteHit: false,
            vblank: false
        };
        this.scrollX = 0;
        this.scrollY = 0;
        this.lastBgColor = -1;
        // dummy
        /*
        for (let addr = 0; addr < 0x3fff; addr++) {
            this.write(addr, (Math.random() * 256) & 255);
        }
        for (let addr = 0; addr < 256; addr++) {
            this.writeSprite(addr, (Math.random() * 256) & 255);
        }
        */
        this.checkPalette();
    }

    private getBuf(addr: number): {
        index: number;
        buf: Uint8Array;
    } {
        addr &= 0x3fff;
        if (addr < 0x2000) {
            return {
                index: addr & 0xfff,
                buf: this.pattern[(addr & 0x1000) ? 1 : 0]
            };
        } else if (addr < 0x3f00) {
            return {
                index: addr & 0x3ff,
                buf: this.nameTable[(addr >> 10) & 3]
            };
        } else {
            return {
                index: addr & 0x1f,
                buf: this.palette
            };
        }
    }

    write(addr: number, val: number): void;
    write(addr: number, val: number[]): void;
    write(addr: number, val: Uint8Array): void;
    write(addr: number, val: any): void {
        // TODO
        if (addr >= 0x4000) {
            return;
        }
        if (typeof val == "number") {
            let buf = this.getBuf(addr);
            buf.buf[buf.index] = val;
        } else if (Array.isArray(val) || val instanceof Uint8Array) {
            let ix = 0;
            let size = val.length;
            while (ix < size) {
                let buf = this.getBuf(addr + ix);
                let sz = Math.min(buf.buf.length - buf.index, size - ix);
                buf.buf.set(val.slice(ix, ix + sz), buf.index);
                ix += sz;
            }
        }
    }

    writeSprite(addr: number, val: number): void;
    writeSprite(addr: number, val: number[]): void;
    writeSprite(addr: number, val: Uint8Array): void;
    writeSprite(addr: number, val: any): void {
        if (typeof val == "number") {
            this.spriteTable[addr] = val;
        } else if (Array.isArray(val) || val instanceof Uint8Array) {
            this.spriteTable.set(val, addr);
        }
    }

    read(addr: number): number;
    read(addr: number, size: number): Uint8Array;
    read(addr: number, size?: number): any {
        if (size !== undefined && !isNaN(size)) {
            // 複数
            let ret = new Uint8Array(size);
            let ix = 0;
            while (ix < size) {
                let buf = this.getBuf(addr + ix);
                let sz = Math.min(buf.buf.length - buf.index, size - ix);
                ret.set(buf.buf.slice(buf.index, sz), ix);
                ix += sz;
            }
            return ret;
        }
        let buf = this.getBuf(addr);
        return buf.buf[buf.index];
    }

    setConfig2000(config: PPUConfig2000): void {
        this.config2000 = Object.assign({}, this.config2000, config);
    }
    setConfig2001(config: PPUConfig2001): void {
        this.config2001 = Object.assign({}, this.config2001, config);
        this.checkPalette();
    }
    setScroll(sx: number, sy: number): void {
        this.scrollX = sx & 255;
        this.scrollY = sy & 255;
    }
    readState(): PPUState {
        let res = Object.assign({}, this.state);
        this.state.vblank = false;
        return res;
    }

    /**
     * パレットの変更をチェックする
     */
    private checkPalette() {
        if (this.config2001.bgColor == this.lastBgColor) {
            return;
        }
        this.lastBgColor = this.config2001.bgColor;
        this.rgbColor = new Uint32Array(64);
        for (let ix = 0; ix < 64; ix++) {
            let r = famPaletteRGB[ix * 3];
            let g = famPaletteRGB[ix * 3 + 1];
            let b = famPaletteRGB[ix * 3 + 2];
            if (this.lastBgColor) {
                if (this.lastBgColor & 4) {
                    r = (r >> 1) + 128;
                } else {
                    r >>= 1;
                }
                if (this.lastBgColor & 2) {
                    g = (g >> 1) + 128;
                } else {
                    g >>= 1;
                }
                if (this.lastBgColor & 1) {
                    b = (b >> 1) + 128;
                } else {
                    b >>= 1;
                }
            }
            //console.log("[" + ix + "]=rgb(" + r + "," + g + "," + b + ")");
            this.rgbColor[ix] = 0xff000000 | (b << 16) | (g << 8) | r;
        }
        console.log(this.rgbColor);
    }

    public scanLine(buf: Uint32Array, line: number): void {
        this.state.spriteHit = this.nextSpriteHit;
        if (line >= 8 && line < 232) {
            // BG
            if (buf) {
                // 設定する
                let bg = this.getColor(this.palette[16] & 63);
                let nmix = this.config2000.nameTable;
                let yy = line + this.scrollY;
                if (yy >= 240) {
                    yy -= 240;
                    nmix ^= 2;
                }
                let attr = 0x3c0 + (yy >> 5) * 8;
                let base = (yy & 0x10) >> 2;
                let pal: number[] = [];
                for (let ax = 0; ax < 8; ax++) {
                    let p = this.nameTable[nmix][attr + ax];
                    pal[ax * 2] = (p >> base) & 3;
                    pal[ax * 2 + 1] = (p >> (base + 2)) & 3;
                    p = this.nameTable[nmix ^ 1][attr + ax];
                    pal[ax * 2 + 16] = (p >> base) & 3;
                    pal[ax * 2 + 17] = (p >> (base + 2)) & 3;
                }
                let ly = yy >> 3;
                let dy = yy % 8;
                let bufix = (line - 8) << 8;
                for (let lx = (this.scrollX >> 3); lx < 64; lx++) {
                    let ch = this.nameTable[nmix ^ (lx < 32 ? 0 : 1)][(ly << 5) | (lx & 31)];
                    let pat = this.getLinePattern(this.config2000.bgPattern, ch, dy);
                    let palix = pal[lx >> 1] << 2;
                    for (let ax = 0; ax < 8; ax++) {
                        let x = (lx << 3) + ax - this.scrollX;
                        if (x < 0) {
                            continue;
                        } else if (x >= 256) {
                            lx = 64;
                            break;
                        }
                        if (this.spriteBuf[x] & 0x80) {
                            // スプライト
                            buf[bufix + x] = this.getColor(this.spriteBuf[x] & 63);
                        } else if (this.config2001.bg && pat[ax] && x >= 8 - this.config2001.bgMask * 8) {
                            // BG
                            buf[bufix + x] = this.getColor(this.palette[palix + pat[ax]]);
                        } else if (this.spriteBuf[x]) {
                            // スプライト
                            buf[bufix + x] = this.getColor(this.spriteBuf[x] & 63);
                        } else {
                            // none
                            buf[bufix + x] = bg;
                        }
                    }
                }
            }
        }
        let ly = (line + 1) % 262;
        if (ly < 240) {
            if (ly == 0) {
                this.state.spriteHit = false;
                this.nextSpriteHit = false;
            }
            // Sprite
            let count = 0;
            let sz = (this.config2000.spriteSize << 3) + 8;
            this.state.scanSprite = 0;
            if (ly >= 8 && ly < 232) {
                this.spriteBuf.fill(0);
            }
            for (let i = 0; i < 64; i++) {
                let y = this.spriteTable[i << 2];
                if (((ly - y) & 0xff) < sz) {
                    count++;
                    if (count > 8) {
                        this.state.scanSprite = 1;
                        break;
                    }
                    if (this.config2001.sprite) {
                        if ((i > 0 || !this.nextSpriteHit) && (ly < 8 || ly >= 232)) {
                            // 0爆弾以外は範囲外をスキップ
                            continue;
                        }
                        // y-1,patIx, VHP000CC P=0:前,1:後ろ
                        let dy = (ly - y) & 255;
                        let flag = this.spriteTable[(i << 2) + 2];
                        if (flag & 0x80) {
                            // 上下反転
                            dy = sz - 1 - dy;
                        }
                        let ch = this.spriteTable[(i << 2) + 1];
                        if (dy & 8) {
                            // TODO ++の方が正解？
                            ch ^= 1;
                            dy &= 7;
                        }
                        let pat = this.getLinePattern(this.config2000.spritePattern, ch, dy);
                        if (i == 0 && !this.nextSpriteHit) {
                            // チェックする
                            for (let x = 0; x < pat.length; x++) {
                                if (pat[x]) {
                                    this.nextSpriteHit = true;
                                    break;
                                }
                            }
                            if (ly < 8 || ly >= 232) {
                                continue;
                            }
                        }
                        if (flag & 0x40) {
                            // 左右反転
                            pat = pat.reverse();
                        }
                        let sx = this.spriteTable[(i << 2) + 3];
                        let palix = 0x10 + ((flag & 3) << 2);
                        let mask = (flag & 0x20 ? 0x40 : 0x80);
                        for (let ax = 0; ax < 8; ax++) {
                            let x = (sx + ax) & 255;
                            if (!this.spriteBuf[x] && pat[ax] && x >= 8 - this.config2001.spriteMask * 8) {
                                this.spriteBuf[x] = mask | this.palette[palix + pat[ax]];
                            }
                        }
                    }
                }
            }
        } else {
            if (line == 240) {
                this.state.vblank = true;
                //this.state.spriteHit = false;
            }
        }
    }

    /**
     * ファミコンの色を取得する
     * @param palIndex 
     */
    private getColor(palIndex: number): number {
        return this.rgbColor[palIndex & 63];
    }

    /**
     * ラインパターンを返す
     * @param patIx 
     * @param ch 
     * @param y 
     */
    private getLinePattern(patIx: number, ch: number, y: number): number[] {
        if (y & 8) {
            ch++;
            y -= 8;
        }
        let low = this.pattern[patIx][ch * 16 + y];
        let hi = this.pattern[patIx][ch * 16 + y + 8];
        let ret: number[] = [];
        for (let dx = 0; dx < 8; dx++) {
            ret[dx] = ((hi & (0x80 >> dx)) ? 2 : 0) | ((low >> (7 - dx)) & 1);
        }
        return ret;
    }
}

export class FamWorkerImpl {
    private famPpu: FamPPUImpl;
    private initType: "power" | "reset" = "power";
    private initParam: any;
    private button: number[] = [0, 0];

    constructor(private famRom: IFamROM) {
        this.famPpu = new FamPPUImpl();
    }

    public reset(): void {
        this.initType = "reset";
        this.famPpu = new FamPPUImpl();
    }

    public execute(req: FamRequestMsg): FamResponseMsg {
        if (req.type == "param") {
            this.initParam = req.option;
            return null;
        }
        let buf: Uint32Array;
        if (req.type == "frame") {
            buf = new Uint32Array(256 * 224);
        }
        if (this.initType) {
            if (this.famRom.init) {
                this.famRom.init({
                    ppu: this.famPpu,
                    apu: null,
                    button: this.button
                }, this.initType, this.initParam);
            }
            this.initType = null;
        }
        for (let i = 0; i < req.button.length; i++) {
            this.button[i] = req.button[i];
        }
        for (let line = 0; line < 262; line++) {
            if (line == 241 && this.famRom.vBlank) {
                // VBlank
                this.famRom.vBlank({
                    ppu: this.famPpu,
                    apu: null,
                    button: this.button
                });
            }
            // HBlank
            if (this.famRom.hBlank) {
                this.famRom.hBlank({
                    ppu: this.famPpu,
                    apu: null,
                    button: this.button
                }, line);
            }
            this.famPpu.scanLine(buf, line);
        }
        return {
            screen: buf
        };
    }
}