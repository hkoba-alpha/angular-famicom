import { IFamROM, IFamPPU, PPUConfig2000, PPUConfig2001, PPUState, ISquareSound, ITriangleSound, INoiseSound, IDeltaSound, IFamAPU, IFamStorage, FamStorageCheck } from "./fam-api";
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

    private nameTableBuf: Uint8Array[] = [new Uint8Array(0x400), new Uint8Array(0x400), new Uint8Array(0x400), new Uint8Array(0x400)];

    // 3F00-3F0F,3F10-3F1F
    private palette: Uint8Array;

    private config2000: PPUConfig2000;
    private config2001: PPUConfig2001;
    private state: PPUState;

    private spriteBuf: Uint8Array = new Uint8Array(256);

    private spriteTable: Uint8Array = new Uint8Array(256);

    private rgbColor: Uint32Array;
    private lastBgColor: number = -1;

    private nextSpriteHit: {
        x: number;
        pattern: number[]
    };

    private reg: {
        v: number;
        t: number;
        x: number;
        w: number;
        inc: number;
        spriteAddr: number;
        lastVal: number;
        readState: boolean;
    };

    constructor(private mode: "vertical" | "horizontal" | "four" | "one0" | "one3" = "vertical") {
        this.reset();
    }
    setMirrorMode(mode: "vertical" | "horizontal" | "four" | "one0" | "one3"): void {
        if (this.mode != mode) {
            this.mode = mode;
            //this.reset();
            this.setMirror();
        }
    }

    writePPU(addr: number, val: number): void {
        switch (addr & 7) {
            case 0: // 2000
                this.setConfig2000({
                    spriteSize: (val & 0x20) > 0 ? 1 : 0,
                    bgPattern: (val & 0x10) > 0 ? 1 : 0,
                    spritePattern: (val & 0x08) > 0 ? 1 : 0,
                    nameTable: val & 3
                });
                if (val & 0x4) {
                    this.reg.inc = 32;
                } else {
                    this.reg.inc = 1;
                }
                //this.reg.t = (this.reg.t & 0x73ff) | ((val & 3) << 10);
                break;
            case 1: // 2001
                this.setConfig2001({
                    bgColor: (val & 0xe0) >> 5,
                    sprite: (val & 0x10) > 0,
                    bg: (val & 0x8) > 0,
                    spriteMask: (val & 0x4) > 0 ? 1 : 0,
                    bgMask: (val & 0x2) > 0 ? 1 : 0
                });
                break;
            case 3: // 2003
                this.reg.spriteAddr = val;
                break;
            case 4: // 2004
                this.writeSprite(this.reg.spriteAddr, val);
                this.reg.spriteAddr = (this.reg.spriteAddr + 1) & 0xff;
                break;
            case 5: // 2005
                if (this.reg.w) {
                    // second
                    this.reg.t = (this.reg.t & 0xc1f) | ((val & 7) << 12) | ((val & 0xf8) << 2);
                    this.reg.w = 0;
                } else {
                    // first
                    this.reg.t = (this.reg.t & 0x7fe0) | (val >> 3);
                    this.reg.x = val & 7;
                    this.reg.w = 1;
                }
                break;
            case 6: // 2006
                if (this.reg.w) {
                    // second
                    this.reg.t = (this.reg.t & 0x7f00) | val;
                    this.reg.v = this.reg.t;
                    this.reg.w = 0;
                } else {
                    // first
                    this.reg.t = (this.reg.t & 0xff) | ((val & 0x3f) << 8);
                    this.reg.w = 1;
                }
                break;
            case 7: // 2007
                this.write(this.reg.v, val);
                if (this.reg.v >= 0x2000 && this.reg.v < 0x3f00) {
                    //console.log(Number(this.reg.v).toString(16) + "<=" + val);
                }
                this.reg.v = (this.reg.v + this.reg.inc) & 0x7fff;
                //this.reg.t = (this.reg.t + this.reg.inc) & 0x7fff;
                break;
        }
    }
    readPPU(addr: number): number {
        switch (addr & 7) {
            case 2: // 2002
                this.reg.w = 0;
                let st = this.readState();
                return (st.scanSprite << 5) | (st.spriteHit ? 0x40 : 0) | (st.vblank ? 0x80 : 0);
            case 7: // 2007
                let ret = this.reg.lastVal;
                this.reg.lastVal = this.read(this.reg.v);
                this.reg.v = (this.reg.v + this.reg.inc) & 0x7fff;
                //this.reg.t = (this.reg.t + this.reg.inc) & 0x7fff;
                return ret;
        }
        return 0;
    }

    private setMirror(): void {
        if (this.mode == "vertical") {
            // 垂直ミラー
            this.nameTable = [this.nameTableBuf[0], this.nameTableBuf[1], this.nameTableBuf[0], this.nameTableBuf[1]];
        } else if (this.mode == "horizontal") {
            // 水平ミラー
            this.nameTable = [this.nameTableBuf[0], this.nameTableBuf[0], this.nameTableBuf[1], this.nameTableBuf[1]];
        } else if (this.mode == "one0") {
            // １画面
            this.nameTable = [this.nameTableBuf[0], this.nameTableBuf[0], this.nameTableBuf[0], this.nameTableBuf[0]];
        } else if (this.mode == "one3") {
            // １画面
            this.nameTable = [this.nameTableBuf[1], this.nameTableBuf[1], this.nameTableBuf[1], this.nameTableBuf[1]];
        } else {
            // ４画面
            this.nameTable = [this.nameTableBuf[0], this.nameTableBuf[1], this.nameTableBuf[2], this.nameTableBuf[3]];
        }
    }
    public reset(): void {
        this.reg = {
            t: 0,
            v: 0,
            w: 0,
            x: 0,
            inc: 1,
            spriteAddr: 0,
            lastVal: 0,
            readState: false
        };
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
        this.setMirror();
        this.palette = new Uint8Array(0x20);
        this.state = {
            scanSprite: 0,
            spriteHit: false,
            vblank: false
        };
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
        if (typeof val == "number") {
            let buf = this.getBuf(addr);
            if (addr >= 0x3f00 && (addr & 15) == 0) {
                // mirror
                buf.buf[buf.index | 16] = val;
            } else {
                buf.buf[buf.index] = val;
            }
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
        this.reg.t = (this.reg.t & 0x73ff) | ((this.config2000.nameTable & 3) << 10);
    }
    setConfig2001(config: PPUConfig2001): void {
        this.config2001 = Object.assign({}, this.config2001, config);
        this.checkPalette();
    }
    setScroll(sx: number, sy: number): void {
        this.reg.w = 0;
        this.reg.x = sx & 7;
        this.reg.t = (sx >> 3) | ((sy & 7) << 12) | ((sy & 0xf8) << 2);
    }
    readState(): PPUState {
        let res = Object.assign({}, this.state);
        this.reg.readState = true;
        //this.state.vblank = false;
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
    }

    public preScanLine(line: number): void {
        if (this.config2001.bg || this.config2001.sprite) {
            if (line == 0) {
                this.reg.v = (this.reg.v & ~0x7be0) | (this.reg.t & 0x7be0);
                //this.reg.v = this.reg.t;
            } else if (line < 240) {
                this.reg.v = (this.reg.v & ~0x41f) | (this.reg.t & 0x41f);
            }
        }
        if (line == 241) {
            this.state.vblank = true;
            this.reg.readState = false;
            //this.state.spriteHit = false;
        } else if (line == 261) {
            if (this.reg.readState) {
                this.state.vblank = false;
            }
            this.state.spriteHit = false;
            this.nextSpriteHit = null;
        } else if (line < 240 && this.state.vblank && this.reg.readState) {
            this.state.vblank = false;
        }
    }

    public scanLine(buf: Uint32Array, line: number): void {
        let hitCheck = false;
        if (this.config2001.bg) {
            if (line >= 8 && line < 232) {
                // BG
                if (buf) {
                    hitCheck = true;
                    // 設定する
                    //let bg = this.getColor(this.palette[16] & 63);
                    let bufix = (line - 8) << 8;
                    let bg = this.getColor(this.palette[16] & 63);
                    let dy = this.reg.v >> 12;
                    let pat: number[];
                    let pal: number[] = [0, 0, 0];
                    let dx = this.reg.x;
                    let palix = 0;
                    for (let x = 0; x < 256; x++) {
                        if (x == 0 || (dx == 0 && (this.reg.v & 3) == 0)) {
                            // pal
                            //let p = this.nameTable[(this.reg.v >> 10) & 3][0x3c0 | ((this.reg.v >> 4) & 0x38) | ((this.reg.v >> 2) & 7)];
                            let p = this.read(0x23c0 | (this.reg.v & 0xc00) | ((this.reg.v >> 4) & 0x38) | ((this.reg.v >> 2) & 7));
                            let base = (this.reg.v & 0x40) >> 4;
                            pal[0] = (p >> base) & 3;
                            pal[2] = (p >> (base + 2)) & 3;
                        }
                        if (x == 0 || dx == 0) {
                            // pat
                            let ch = this.nameTable[(this.reg.v >> 10) & 3][this.reg.v & 0x3ff];
                            pat = this.getLinePattern(this.config2000.bgPattern, ch, dy);
                            palix = pal[this.reg.v & 2] << 2;
                        }
                        if (x < 8 && !this.config2001.bgMask) {
                            buf[bufix | x] = bg;
                        } else {
                            if (this.spriteBuf[x] & 0x80) {
                                buf[bufix | x] = this.getColor(this.spriteBuf[x]);
                            } else if (pat[dx]) {
                                buf[bufix | x] = this.getColor(this.palette[palix + pat[dx]]);
                            } else if (this.spriteBuf[x] & 0x40) {
                                buf[bufix | x] = this.getColor(this.spriteBuf[x]);
                            } else {
                                buf[bufix | x] = bg;
                            }
                            if (!this.state.spriteHit && this.nextSpriteHit) {
                                if (x >= this.nextSpriteHit.x && x < this.nextSpriteHit.x + 8) {
                                    if (this.nextSpriteHit.pattern[x - this.nextSpriteHit.x] && pat[dx]) {
                                        this.state.spriteHit = true;
                                    }
                                }
                            }
                        }
                        dx++;
                        if (dx & 8) {
                            dx = 0;
                            if ((this.reg.v & 0x1f) == 31) {
                                this.reg.v &= ~0x1f;
                                this.reg.v ^= 0x400;
                            } else {
                                this.reg.v++;
                            }
                        }
                    }
                }
            }
        } else if (line >= 8 && line < 232) {
            // BG
            if (buf) {
                // 設定する
                let bufix = (line - 8) << 8;
                let bg = this.getColor(this.palette[16] & 63);
                for (let x = 0; x < 256; x++) {
                    buf[bufix | x] = bg;
                }
            }
        }
        if ((this.config2001.bg || this.config2001.sprite) && line < 240) {
            if (!hitCheck && !this.state.spriteHit && this.nextSpriteHit) {
                if (this.config2001.bg) {
                    // TODO 本来は背景との重なりをチェック
                    for (let i = 0; i < 8; i++) {
                        if (this.nextSpriteHit.pattern[i]) {
                            this.state.spriteHit = true;
                            break;
                        }
                    }
                }
            }
            this.reg.v = (this.reg.v & ~0x41f) | (this.reg.t & 0x41f);
            if ((this.reg.v & 0x7000) != 0x7000) {
                this.reg.v += 0x1000;
            } else {
                this.reg.v &= 0xfff;
                let y = (this.reg.v & 0x3e0) >> 5;
                if (y == 29) {
                    y = 0;
                    this.reg.v ^= 0x800;
                } else if (y == 31) {
                    y = 0;
                } else {
                    y++;
                }
                this.reg.v = (this.reg.v & ~0x3e0) | (y << 5);
            }
        }
        let ly = (line + 1) % 262;
        if (ly < 240) {
            // Sprite
            if (!this.config2001.sprite) {
                return;
            }
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
                        if ((i > 0 || !this.state.spriteHit) && (ly < 8 || ly >= 232)) {
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
                        if (this.config2000.spriteSize) {
                            // スプライト16だとこうするらしい
                            ch &= ~1;
                        }
                        if (dy & 8) {
                            // TODO ++の方が正解？
                            ch++;
                            dy &= 7;
                        }
                        let pat = this.getLinePattern(this.config2000.spritePattern, ch, dy);
                        let sx = this.spriteTable[(i << 2) + 3];
                        if (flag & 0x40) {
                            // 左右反転
                            pat = pat.reverse();
                        }
                        if (i == 0) {
                            this.nextSpriteHit = {
                                x: sx,
                                pattern: pat
                            };
                        }
                        let palix = 0x10 + ((flag & 3) << 2);
                        let mask = (flag & 0x20 ? 0x40 : 0x80);
                        for (let ax = 0; ax < 8; ax++) {
                            //let x = (sx + ax) & 255;
                            // 右端を超えた分は表示しない
                            let x = sx + ax;
                            if (x & 0x100) {
                                continue;
                            }
                            if (!this.spriteBuf[x] && pat[ax] && x >= 8 - this.config2001.spriteMask * 8) {
                                this.spriteBuf[x] = mask | this.palette[palix + pat[ax]];
                            }
                        }
                    }
                } else if (i == 0) {
                    this.nextSpriteHit = null;
                }
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

export abstract class FamStorageBase implements IFamStorage {
    private updateCount: number = 0;

    constructor(protected buffer: Uint8Array) {
    }

    size(): number {
        return this.buffer.length;
    }
    write(addr: number, val: number): void;
    write(addr: number, val: number[]): void;
    write(addr: number, val: Uint8Array): void;
    write(addr: any, val: any) {
        if (typeof val == "number") {
            if (this.buffer[addr] != val) {
                this.buffer[addr] = val;
                this.updateCount++;
            }
        } else if (Array.isArray(val) || val instanceof Uint8Array) {
            this.buffer.set(val, addr);
            this.updateCount++;
        }
    }

    read(addr: number): number;
    read(addr: number, size: number): Uint8Array;
    read(addr: any, size?: any) {
        if (size !== undefined && !isNaN(size)) {
            // 複数
            let ret = new Uint8Array(size);
            let ix = 0;
            ret.set(this.buffer.slice(addr, addr + size));
            return ret;
        }
        return this.buffer[addr];
    }

    public getUpdateCount(): number {
        return this.updateCount;
    }

    public flush(): void {
        this.flushData(this.buffer);
        this.updateCount = 0;
    }

    /**
     * 変更データを反映させる
     */
    abstract flushData(data: Uint8Array): void;
}
/**
 * 処理本体実装クラス
 */
export class FamWorkerImpl {
    private famPpu: FamPPUImpl;
    private famApu: FamAPUImpl;
    private initType: "power" | "reset" = "power";
    private initParam: any;
    private button: number[] = [0, 0];
    private famStorage: FamStorageBase;

    constructor(private famRom: IFamROM, private storageCheck: FamStorageCheck) {
        this.famPpu = new FamPPUImpl();
        this.famApu = new FamAPUImpl();
        if (this.famRom.checkStorage) {
            this.famRom.checkStorage((key, size) => {
                return new Promise((resolve, reject) => {
                    this.storageCheck(key, size).then(res => {
                        if (res instanceof FamStorageBase) {
                            this.famStorage = res;
                        }
                        resolve(res);
                    }, err => reject(err));
                });
            });
        }
    }

    public reset(): void {
        this.initType = "reset";
        this.famPpu.reset();
        this.famApu.reset();
    }

    public execute(req: FamRequestMsg): FamResponseMsg {
        if (req.type == "param") {
            this.initParam = req.option;
            return null;
        } else if (req.type == "shutdown") {
            return null;
        } else if (req.type == "reset") {
            this.reset();
        }
        let buf: Uint32Array;
        if (req.type == "frame") {
            buf = new Uint32Array(256 * 224);
        }
        if (this.initType) {
            if (this.famRom.init) {
                this.famRom.init({
                    ppu: this.famPpu,
                    apu: this.famApu,
                    button: this.button
                }, this.initType, this.initParam);
            }
            this.initType = null;
        }
        for (let i = 0; i < req.button.length; i++) {
            this.button[i] = req.button[i];
        }
        let apuBuf = new Uint8Array(SAMPLE_RATE * 4);
        let apuIx = 0;
        for (let line = 0; line < 262; line++) {
            if (line == 241 && this.famRom.vBlank) {
                // VBlank
                this.famRom.vBlank({
                    ppu: this.famPpu,
                    apu: this.famApu,
                    button: this.button
                });
            }
            this.famPpu.preScanLine(line);
            // HBlank
            if (this.famRom.preScanLine) {
                this.famRom.preScanLine({
                    ppu: this.famPpu,
                    apu: this.famApu,
                    button: this.button
                }, line);
            }
            this.famPpu.scanLine(buf, line);
            // HBlank
            if (this.famRom.hBlank) {
                this.famRom.hBlank({
                    ppu: this.famPpu,
                    apu: this.famApu,
                    button: this.button
                }, line);
            }
            switch (line) {
                case 0:
                case 66:
                case 131:
                case 197:
                    this.famApu.stepFrame(apuBuf, apuIx);
                    apuIx++;
                    break;
            }
        }
        this.syncStorage(false);
        return {
            screen: buf,
            sound: apuBuf
        };
    }

    public shutdown(): void {
        this.syncStorage(true);
    }

    // ストレージの更新チェック
    private storageState = {
        lastCount: 0,
        contCount: 0,
        skipCount: 0
    };

    private syncStorage(force: boolean): void {
        if (this.famStorage && this.famStorage.getUpdateCount() > 0) {
            let cnt = this.famStorage.getUpdateCount();
            if (cnt > this.storageState.lastCount) {
                this.storageState.lastCount = cnt;
                this.storageState.skipCount = 0;
            } else {
                this.storageState.skipCount++;
            }
            this.storageState.contCount++;
            if (force || this.storageState.skipCount > 60 || this.storageState.contCount > 600) {
                // 強制か１秒以上更新がないか１０秒以上更新し続けていたらフラッシュする
                this.famStorage.flush();
                this.storageState.lastCount = 0;
                this.storageState.contCount = 0;
                this.storageState.skipCount = 0;
            }
        }
    }
}

// APU
const lengthIndexList = [
    0x0a, 0xfe, 0x14, 0x02, 0x28,
    0x04, 0x50, 0x06, 0xa0, 0x08, 0x3c, 0x0a, 0x0e, 0x0c, 0x1a, 0x0e,
    0x0c, 0x10, 0x18, 0x12, 0x30, 0x14, 0x60, 0x16, 0xc0, 0x18, 0x48,
    0x1a, 0x10, 0x1c, 0x20, 0x1e
];

const squareSampleDataList = [
    [0, 0, 0, 0, 0, 0, 0, 1],
    [0, 0, 0, 0, 0, 0, 1, 1],
    [0, 0, 0, 0, 1, 1, 1, 1],
    [0, 0, 1, 1, 1, 1, 1, 1]
    /*
     [0, 1, 0, 0, 0, 0, 0, 0],
     [0, 1, 1, 0, 0, 0, 0, 0],
     [0, 1, 1, 1, 0, 0, 0, 0],
     [1, 0, 0, 1, 1, 1, 1, 1]
    [0, 0, 0, 0, 1, 0, 0, 0],
    [0, 0, 0, 1, 1, 0, 0, 0],
    [0, 0, 1, 1, 1, 1, 0, 0],
    [0, 1, 1, 1, 1, 1, 1, 0]
     */
];
const triangleSampleData = [
    15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0,
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15
];


// 240Hzの１つのクロック数
const FRAME_CLOCK = 7457;

// 240Hzのサンプル数
const SAMPLE_RATE = 200;

let pulse_table: number[] = [0];
for (let i = 1; i <= 30; i++) {
    pulse_table[i] = 95.52 / (8128.0 / i + 100);
}

let tnd_table: number[] = [0];
for (let i = 1; i <= 3 * 15 + 2 * 15 + 127; i++) {
    tnd_table[i] = 163.67 / (24329.0 / i + 100);
}

let addClock: number[] = [];

for (let i = 0; i < SAMPLE_RATE; i++) {
    addClock[i] = Math.floor(((i + 1) * FRAME_CLOCK / SAMPLE_RATE)
        - Math.floor(i * FRAME_CLOCK / SAMPLE_RATE));
}

class SquareSoundImpl implements ISquareSound {
    private output = new Uint8Array(SAMPLE_RATE);

    private lengthCounter: number = 0;
    private timerCounter: number = 0;
    private loopFlag: boolean = false;
    private timerIndex: number = 0;
    private timerOffset: number = 0;
    private volume: number = 0;
    private sample: number[] = squareSampleDataList[0];

    private nextTimer: {
        length: number;
        timer: number;
    };
    private nextVolume: {
        duty: number;
        halt: boolean;
        volume: number;
    };
    private nextEnvelope: {
        duty: number;
        loop: boolean;
        period: number;
    };
    private nextSweep: {
        enableFlag: boolean;
        period: number;
        mode: number;
        value: number;
    };
    private envelopeData: {
        period: number;
        count: number;
    };
    private sweepData: {
        period: number;
        mode: number;
        value: number;
        count: number;
    };
    private nextSample: number[];
    private changeIndex: number;

    constructor(private channel: number) {
    }

    setVolume(duty: number, halt: boolean, volume: number): ISquareSound {
        this.nextVolume = {
            duty: duty,
            halt: halt,
            volume: volume
        };
        this.nextEnvelope = null;
        return this;
    }
    setEnvelope(duty: number, loop: boolean, period: number): ISquareSound {
        this.nextEnvelope = {
            duty: duty,
            loop: loop,
            period: period + 1
        };
        this.nextVolume = null;
        return this;
    }
    setTimer(lenIndex: number, timer: number): ISquareSound {
        this.nextTimer = {
            length: lengthIndexList[lenIndex],
            timer: timer + 1
        }
        if (this.envelopeData) {
            this.envelopeData.count = this.envelopeData.period;
            this.volume = 15;
        }
        if (timer < 7 || timer > 0x7fe) {
            this.lengthCounter = 0;
            this.nextTimer = null;
        }
        return this;
    }
    setTimerLow(low: number): ISquareSound {
        if (this.nextTimer) {
            this.nextTimer.timer = (((this.nextTimer.timer - 1) & 0xff00) | low) + 1;
        } else if (this.timerCounter > 0) {
            this.nextTimer = {
                timer: (((this.timerCounter - 1) & 0xff00) | (low & 255)) + 1,
                length: this.lengthCounter
            }
        } else {
            this.nextTimer = {
                timer: low + 1,
                length: this.lengthCounter
            }
        }
        /*
        if (this.nextTimer.timer < 8 || this.nextTimer.timer > 0x7ff) {
            this.lengthCounter = 0;
            this.nextTimer = null;
        }
            if (this.envelopeData) {
                this.envelopeData.count = this.envelopeData.period;
                this.volume = 15;
            }
            */
        return this;
    }
    setSweep(enableFlag: boolean, period: number, mode: number, value: number): ISquareSound {
        this.nextSweep = {
            enableFlag: enableFlag,
            period: period + 1,
            mode: mode,
            value: value
        };
        return this;
    }
    setEnabled(flag: boolean): ISquareSound {
        if (!flag) {
            this.lengthCounter = 0;
        }
        return this;
    }
    isPlaing(): boolean {
        return this.lengthCounter > 0;
    }

    private changeDuty(duty: number): void {
        /*
        this.sample = squareSampleDataList[duty];
        this.timerIndex = 0;
        this.timerOffset = 0;
        */
        this.nextSample = squareSampleDataList[duty];
        if (this.nextSample == this.sample) {
            this.nextSample = null;
            return;
        }
        this.changeIndex = 0;
        for (let i = 2; i < this.sample.length; i++) {
            if (this.sample[i] && this.nextSample[i]) {
                this.changeIndex = i;
                break;
            }
        }
    }

    public getOutput(l: boolean, e: boolean): Uint8Array {
        if (this.nextTimer) {
            if (this.timerCounter) {
                this.timerOffset = Math.floor(this.timerOffset * this.nextTimer.timer / this.timerCounter);
            }
            this.timerCounter = this.nextTimer.timer;
            this.lengthCounter = this.nextTimer.length;
            //this.timerOffset = 0;
            this.nextTimer = null;
        }
        if (this.nextVolume) {
            this.envelopeData = null;
            this.changeDuty(this.nextVolume.duty);
            this.loopFlag = this.nextVolume.halt;
            this.volume = this.nextVolume.volume;
            this.nextVolume = null;
        } else if (this.nextEnvelope) {
            this.changeDuty(this.nextEnvelope.duty);
            this.loopFlag = this.nextEnvelope.loop;
            this.volume = 15;
            this.envelopeData = {
                period: this.nextEnvelope.period,
                count: this.nextEnvelope.period
            };
            this.nextEnvelope = null;
        }
        if (this.nextSweep) {
            if (this.nextSweep.enableFlag) {
                this.sweepData = {
                    period: this.nextSweep.period,
                    mode: this.nextSweep.mode,
                    value: this.nextSweep.value,
                    count: this.nextSweep.period
                };
            } else {
                this.sweepData = null;
            }
            this.nextSweep = null;
        }
        if (l) {
            if (!this.loopFlag) {
                if (this.lengthCounter > 0) {
                    this.lengthCounter--;
                } else {
                    // TODO
                }
            }
            if (this.sweepData) {
                this.sweepData.count--;
                if (this.sweepData.count == 0) {
                    if (this.sweepData.value) {
                        let newTimer: number;
                        if (this.sweepData.mode) {
                            // 尻上がり
                            newTimer = this.timerCounter - (this.timerCounter >> this.sweepData.value);
                            if (!this.channel) {
                                newTimer--;
                            }
                        } else {
                            // しり下がり
                            newTimer = this.timerCounter + (this.timerCounter >> this.sweepData.value);
                        }
                        if (this.timerCounter) {
                            this.timerOffset = Math.floor(this.timerOffset * newTimer / this.timerCounter);
                        }
                        this.timerCounter = newTimer;
                    }
                    this.sweepData.count = this.sweepData.period;
                    if (this.timerCounter < 8 || this.timerCounter > 0x7ff) {
                        this.lengthCounter = 0;
                        this.sweepData = null;
                    }
                }
            }
        }
        if (e) {
            if (this.envelopeData) {
                this.envelopeData.count--;
                if (this.envelopeData.count == 0) {
                    if (this.volume > 0) {
                        this.volume--;
                    } else if (this.loopFlag) {
                        this.volume = 15;
                    }
                    this.envelopeData.count = this.envelopeData.period;
                }
            }
        }
        let size = this.timerCounter * 2;
        /*
        if (this.timerCounter < 8 || this.timerCounter > 0x7ff) {
            this.lengthCounter = 0;
            this.sweepData = null;
        }
        */
        for (let i = 0; i < SAMPLE_RATE; i++) {
            if (this.lengthCounter) {
                this.output[i] = this.sample[this.timerIndex] * this.volume;
                this.timerOffset += addClock[i];
                if (this.timerOffset >= size) {
                    // 移動する
                    this.timerIndex = (this.timerIndex + Math.floor(this.timerOffset / size)) % this.sample.length;
                    this.timerOffset %= size;
                }
                if (this.nextSample && this.timerIndex >= this.changeIndex) {
                    this.sample = this.nextSample;
                    this.nextSample = null;
                }
                //this.output[i] = squareSampleDataList[2][this.timerIndex] * this.volume;
            } else {
                this.output[i] = 0;
            }
        }
        return this.output;
    }
}

class TriangleSoundImpl implements ITriangleSound {
    private output = new Uint8Array(SAMPLE_RATE);

    private loopFlag: boolean = false;
    private lengthCounter: number = 0;
    private timerCounter: number = 0;
    private lineCounter: number = 0;
    private lineCountData: number = 0;
    private timerIndex: number = 0;
    private timerOffset: number = 0;

    private nextTimer: {
        length: number;
        timer: number;
    };
    private nextLinear: {
        loop: boolean;
        count: number;
    };

    setLinear(loop: boolean, lineCount: number): ITriangleSound {
        this.nextLinear = {
            loop: loop,
            count: lineCount
        };
        return this;
    }
    setTimer(lenIndex: number, timerCount: number): ITriangleSound {
        this.nextTimer = {
            length: lengthIndexList[lenIndex],
            timer: timerCount + 1
        };
        if (!this.nextLinear) {
            this.nextLinear = {
                loop: this.loopFlag,
                count: this.lineCountData
            };
        }
        return this;
    }
    setTimerLow(low: number): ITriangleSound {
        if (this.nextTimer) {
            this.nextTimer.timer = (((this.nextTimer.timer - 1) & 0xff00) | low) + 1;
        } else if (this.timerCounter > 0) {
            this.nextTimer = {
                length: this.lengthCounter,
                timer: (((this.timerCounter - 1) & 0xff00) | low) + 1
            }
        } else {
            this.nextTimer = {
                length: this.lengthCounter,
                timer: low + 1
            }
        }
        return this;
    }
    setEnabled(flag: boolean): ITriangleSound {
        if (!flag) {
            this.lengthCounter = 0;
        }
        return this;
    }
    isPlaing(): boolean {
        return this.lengthCounter > 0 && this.lineCounter > 0;
    }
    public getOutput(l: boolean, e: boolean): Uint8Array {
        if (this.nextLinear) {
            this.loopFlag = this.nextLinear.loop;
            this.lineCounter = this.nextLinear.count;
            this.lineCountData = this.lineCounter;
            this.nextLinear = null;
        }
        if (this.nextTimer) {
            if (this.timerCounter) {
                this.timerOffset = Math.floor(this.timerOffset * this.nextTimer.timer / this.timerCounter);
            }
            this.lengthCounter = this.nextTimer.length;
            this.timerCounter = this.nextTimer.timer;
            this.nextTimer = null;
        }
        if (l) {
            if (this.loopFlag) {
                // これはカウントダウンさせない
                /*
                if (this.lineCounter > 0) {
                    this.lineCounter--;
                }
                */
            } else if (this.lengthCounter > 0) {
                this.lengthCounter--;
            }
        }
        let size = this.timerCounter;
        for (let i = 0; i < SAMPLE_RATE; i++) {
            if (this.timerCounter >= 4 && this.lineCounter && this.lengthCounter) {
                this.output[i] = triangleSampleData[this.timerIndex];
                this.timerOffset += addClock[i];
                if (this.timerOffset >= size) {
                    this.timerIndex = (this.timerIndex + Math.floor(this.timerOffset / size)) % triangleSampleData.length;
                    this.timerOffset %= size;
                }
            } else {
                this.output[i] = 0;
            }
        }
        return this.output;
    }
}

const noiseTimerIndex: number[] = [
    4, 8, 0x10, 0x20, 0x40, 0x60, 0x80, 0xa0,
    0xca, 0xfe, 0x17c, 0x2fa, 0x3f8, 0x7f2, 0xfe4
];

class NoiseSoundImpl implements INoiseSound {
    private output = new Uint8Array(SAMPLE_RATE);
    private lengthCounter: number = 0;
    private timerCounter: number = 0;
    private volume: number = 0;
    private shiftRegister: number = 1;
    private loopFlag: boolean = false;
    private timerOffset: number = 0;
    private shortMode: boolean = false;
    private envelopeData: {
        period: number;
        count: number;
    };

    private nextVolume: {
        stop: boolean;
        volume: number;
    };
    private nextEnvelope: {
        loop: boolean;
        period: number;
    };
    private nextTimer: {
        mode: number;
        timer: number;
    };
    private nextLength: number;

    setVolume(stopFlag: boolean, volume: number): INoiseSound {
        this.nextVolume = {
            stop: stopFlag,
            volume: volume
        };
        this.nextEnvelope = null;
        return this;
    }
    setEnvelope(loopFlag: boolean, period: number): INoiseSound {
        this.nextEnvelope = {
            loop: loopFlag,
            period: period + 1
        };
        this.nextVolume = null;
        return this;
    }
    setRandomMode(shortFlag: number, timerIndex: number): INoiseSound {
        this.nextTimer = {
            mode: shortFlag,
            timer: noiseTimerIndex[timerIndex]
        }
        return this;
    }
    setLength(lengthIndex: number): INoiseSound {
        this.nextLength = lengthIndexList[lengthIndex];
        if (!this.nextEnvelope && !this.nextVolume && this.envelopeData) {
            this.nextEnvelope = {
                loop: this.loopFlag,
                period: this.envelopeData.period
            };
        }
        return this;
    }
    setEnabled(flag: boolean): INoiseSound {
        if (!flag) {
            this.lengthCounter = 0;
        }
        return this;
    }
    isPlaing(): boolean {
        return this.lengthCounter > 0;
    }

    public getOutput(l: boolean, e: boolean): Uint8Array {
        if (this.nextVolume) {
            this.loopFlag = this.nextVolume.stop;
            this.volume = this.nextVolume.volume;
            this.nextVolume = null;
            this.envelopeData = null;
        } else if (this.nextEnvelope) {
            this.loopFlag = this.nextEnvelope.loop;
            this.volume = 15;
            this.envelopeData = {
                period: this.nextEnvelope.period,
                count: this.nextEnvelope.period
            };
            this.nextEnvelope = null;
        }
        if (this.nextTimer) {
            if (this.timerCounter) {
                this.timerOffset = Math.floor(this.timerOffset * this.timerCounter / this.nextTimer.timer);
            }
            this.timerCounter = this.nextTimer.timer;
            this.shortMode = this.nextTimer.mode > 0;
            this.nextTimer = null;
        }
        if (this.nextLength) {
            this.lengthCounter = this.nextLength;
            this.nextLength = undefined;
        }
        if (l) {
            if (!this.loopFlag) {
                if (this.lengthCounter > 0) {
                    this.lengthCounter--;
                }
            }
        }
        if (e) {
            if (this.envelopeData) {
                this.envelopeData.count--;
                if (this.envelopeData.count == 0) {
                    if (this.volume > 0) {
                        this.volume--;
                    } else if (this.loopFlag) {
                        this.volume = 15;
                    }
                    this.envelopeData.count = this.envelopeData.period;
                }
            }
        }
        let size = this.timerCounter;
        for (let i = 0; i < SAMPLE_RATE; i++) {
            if (this.timerCounter >= 4 && this.lengthCounter) {
                if (this.shiftRegister & 1) {
                    this.output[i] = 0;
                } else {
                    this.output[i] = this.volume;
                }
                this.timerOffset += addClock[i];
                while (this.timerOffset >= size) {
                    let flag: number;
                    if (this.shortMode) {
                        flag = ((this.shiftRegister << 14) ^ (this.shiftRegister << 8)) & 0x4000;
                    } else {
                        flag = ((this.shiftRegister << 13) ^ (this.shiftRegister << 14)) & 0x4000;
                    }
                    this.shiftRegister = flag | (this.shiftRegister >> 1);
                    this.timerOffset -= size;
                }
            } else {
                this.output[i] = 0;
            }
        }
        return this.output;
    }

}

const dmcTimerIndex = [
    0x1ac, 0x17c, 0x154, 0x140, 0x11e, 0x0fe, 0x0e2, 0x0d6,
    0x0be, 0x0a0, 0x08e, 0x080, 0x06a, 0x054, 0x048, 0x036
];

class DeltaSoundImpl implements IDeltaSound {
    private output = new Uint8Array(SAMPLE_RATE);
    private sample: {
        buffer: number;
        delta: number;
        shift: number;
        count: number;
        reader?: (index: number, last?: boolean) => number;
    };
    private counter: {
        loop: boolean;
        index: number;
        count: number;
    };
    private nextPeriod: {
        loop: boolean;
        timer: number;
    };
    private timerCounter: number = 0;
    private timerOffset: number = 0;
    private enableFlag: boolean;

    constructor() {
        this.counter = {
            loop: false,
            index: 0,
            count: 0
        };
        this.sample = {
            buffer: -1,
            delta: 0,
            shift: 0,
            count: 0
        };
    }

    setPeriod(loopFlag: boolean, periodIndex: number): IDeltaSound {
        this.nextPeriod = {
            loop: loopFlag,
            timer: dmcTimerIndex[periodIndex & 15]
        };
        return this;
    }
    setDelta(delta: number): IDeltaSound {
        this.sample.delta = delta & 0x7f;
        return this;
    }
    setSample(reader: (index: number, last?: boolean) => number, count: number): IDeltaSound {
        this.sample.reader = reader;
        this.counter.count = count * 0x10 + 1;
        this.counter.index = 0;
        return this;
    }
    setEnabled(flag: boolean): IDeltaSound {
        this.enableFlag = flag;
        return this;
    }
    isPlaing(): boolean {
        return this.sample.buffer >= 0;
    }

    public getOutput(l: boolean, e: boolean): Uint8Array {
        if (this.nextPeriod) {
            if (this.timerCounter) {
                this.timerOffset = Math.floor(this.timerOffset / this.timerCounter * this.nextPeriod.timer);
            }
            this.counter.loop = this.nextPeriod.loop;
            this.timerCounter = this.nextPeriod.timer;
            this.nextPeriod = null;
        }
        let size = this.timerCounter;
        for (let i = 0; i < SAMPLE_RATE; i++) {
            if (this.sample.buffer < 0) {
                this.output[i] = 0;
            } else {
                this.output[i] = this.sample.delta;
            }
            if (size > 4) {
                this.timerOffset += addClock[i];
                while (this.timerOffset >= size) {
                    if (this.sample.count > 0) {
                        this.sample.count--;
                    } else {
                        this.sample.buffer = -1;
                    }
                    if (this.sample.buffer < 0) {
                        // サンプルが空
                        if (this.sample.reader) {
                            if (this.counter.index < this.counter.count) {
                                this.sample.buffer = this.sample.reader(this.counter.index, !this.counter.loop && this.counter.index + 1 == this.counter.count);
                                this.sample.shift = this.sample.buffer;
                                this.sample.count = 7;
                                this.counter.index++;
                                if (this.counter.loop && this.counter.index >= this.counter.count) {
                                    this.counter.index = 0;
                                }
                            } else {
                                this.sample.buffer = -1;
                            }
                        } else {
                            // silence
                        }
                    }
                    if (this.sample.buffer >= 0) {
                        if (this.sample.shift & 1) {
                            if (this.sample.delta < 126) {
                                this.sample.delta += 2;
                            }
                        } else if (this.sample.delta > 1) {
                            this.sample.delta -= 2;
                        }
                        this.sample.shift >>= 1;
                    }
                    this.timerOffset -= size;
                }
            }
        }
        return this.output;
    }

}

class FamAPUImpl implements IFamAPU {
    triangle: TriangleSoundImpl;
    noise: NoiseSoundImpl;
    delta: DeltaSoundImpl;
    square: [SquareSoundImpl, SquareSoundImpl];
    private irqCallback: (apu: IFamAPU) => void

    private stepMode: number;
    private seqNumber: number;

    constructor() {
        this.reset();
    }

    public reset(): void {
        this.square = [new SquareSoundImpl(0), new SquareSoundImpl(1)];
        this.triangle = new TriangleSoundImpl();
        this.noise = new NoiseSoundImpl();
        this.delta = new DeltaSoundImpl();
        this.stepMode = 0;
        this.seqNumber = 0;
    }

    setMode(mode: number, irq?: (apu: IFamAPU) => void): IFamAPU {
        this.stepMode = mode;
        this.seqNumber = 0;
        if (mode == 0 && irq) {
            this.irqCallback = irq;
        } else {
            this.irqCallback = null;
        }
        return this;
    }

    public stepFrame(data: Uint8Array, index: number): number {
        // 約1.789MHzを7457分周することで240Hzのクロックレート
        let e = true;
        let l = false;
        let ret = this.seqNumber;
        if (this.stepMode) {
            // 5 step
            if (this.seqNumber == 1 || this.seqNumber == 4) {
                l = true;
            } else if (this.seqNumber == 3) {
                e = false;
            }
            this.seqNumber = (this.seqNumber + 1) % 5;
        } else {
            // 4 step
            if (this.seqNumber & 1) {
                l = true;
            }
            this.seqNumber = (this.seqNumber + 1) % 4;
        }
        let pl1 = this.square[0].getOutput(l, e);
        let pl2 = this.square[1].getOutput(l, e);
        let tri = this.triangle.getOutput(l, e);
        let noi = this.noise.getOutput(l, e);
        let dmc = this.delta.getOutput(l, e);
        let offset = index * SAMPLE_RATE;
        for (let i = 0; i < SAMPLE_RATE; i++) {
            data[offset + i] = Math.min(255, (pulse_table[pl1[i] + pl2[i]] + tnd_table[3 * tri[i] + 2 * noi[i] + dmc[i]]) * 255);
            //data[offset + i] = dmc[i];
        }
        if (ret == 3 && this.irqCallback && !this.stepMode) {
            this.irqCallback(this);
        }
        //console.log("frame");
        return ret;
    }
}