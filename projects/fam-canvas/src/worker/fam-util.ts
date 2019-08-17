import { FamData, IFamPPU } from "./fam-api";

const PRG_SIZE = 0x4000;
const CHR_SIZE = 0x2000;

var debugLogFlag = false;

/**
 * NES-ROMクラス
 * 
 * 0123456789ABCDEF
 * NES_
 *     ^ 4:PRGバンク数
 *      ^ 5:CHRバンク数
 *       ^ 6:MAPPER下位バイト
 *        ^ 7:MAPPER上位バイト
 */
export class NesRomData {
    private prgBankNum: number;
    private chrBankNum: number;
    private setupFlag: number;
    public readonly mapperType: number;

    constructor(private romData: Uint8Array) {
        if (romData[0] != 0x4e || romData[1] != 0x45 || romData[2] != 0x53 || romData[3] != 0x1a) {
            // NES<EOF>ではない
            throw "ヘッダエラー";
        }
        this.prgBankNum = romData[4];
        this.chrBankNum = romData[5];
        this.setupFlag = romData[6] & 0xf;
        this.mapperType = (romData[7] & 0xf0) | (romData[6] >> 4);
        console.log("rom_size=" + romData.length + ", len=" + (this.prgBankNum * 0x4000 + this.chrBankNum * 0x2000));
    }

    public get prgSize(): number {
        return this.prgBankNum;
    }
    public get chrSize(): number {
        return this.chrBankNum;
    }
    public get mirrorMode(): "vertical" | "horizontal" | "four" {
        return (this.setupFlag & 0x8) > 0 ? "four" : ((this.setupFlag & 1) > 0 ? "vertical" : "horizontal");
    }
    public get hasBattery(): boolean {
        return (this.setupFlag & 2) > 0;
    }
    public get isTrain(): boolean {
        return (this.setupFlag & 4) > 0;
    }

    public getPrg(no: number, size = 1): Uint8Array {
        let sx = no * PRG_SIZE + 16;
        return this.romData.subarray(sx, sx + size * PRG_SIZE);
    }

    public getChr(no: number, size = 1): Uint8Array {
        let sx = this.prgBankNum * PRG_SIZE + no * CHR_SIZE + 16;
        return this.romData.subarray(sx, sx + size * CHR_SIZE);
    }

    public static load(url: string): Promise<NesRomData> {
        return new Promise((resolve, reject) => {
            let req = new XMLHttpRequest();
            req.open('GET', url, true);
            req.responseType = "arraybuffer";
            req.onreadystatechange = () => {
                if (req.readyState == 4) {
                    // Complete
                    if (req.status == 200) {
                        try {
                            resolve(new NesRomData(new Uint8Array(req.response)));
                        } catch (e) {
                            // Error
                            reject(e);
                        }
                    } else {
                        // TODO
                        reject(req.response);
                    }
                }
            };
            req.send(null);
        });
    }
}

/**
 * メインメモリアクセス用
 */
export interface IFamMemory {
    write(addr: number, val: number): void;
    read(addr: number): number;
}

/**
 * RAM
 */
class WramMemory implements IFamMemory {
    private memory: Uint8Array;

    constructor(public readonly size: number = 0x800) {
        this.memory = new Uint8Array(this.size);
    }

    write(addr: number, val: number): void {
        this.memory[addr] = val & 255;
    }
    read(addr: number): number {
        return this.memory[addr];
    }
}

/**
 * PPUメモリ
 */
class PpuMemory implements IFamMemory {
    private nmiFlag: boolean;
    private ppuAddr: number;
    private ppuNextAddr: number;
    private ppuInc: number = 1;
    private spriteAddr: number;
    private scrollIx: number;
    private scrollPos: number[];
    private ppuReadData: number;

    private reg: {
        v: number;
        t: number;
        x: number;
        w: number;
    };

    constructor(private famPpu: IFamPPU, private parent: IFamMemory) {
        this.reset();
    }

    reset() {
        this.famPpu.reset();
        this.nmiFlag = false;
        this.ppuAddr = 0;
        this.ppuInc = 1;
        this.spriteAddr = 0;
        this.scrollIx = 0;
        this.scrollPos = [0, 0];
        this.ppuReadData = 0;
        this.reg = {
            v: 0,
            t: 0,
            x: 0,
            w: 0
        };
    }

    get isNmiEnabled(): boolean {
        return this.nmiFlag;
    }

    write(addr: number, val: number): void {
        switch (addr & 7) {
            case 0: // 2000
                //console.log("VRAM 2000:" + Number(val).toString(16));
                this.nmiFlag = (val & 0x80) > 0;
                this.famPpu.setConfig2000({
                    spriteSize: (val & 0x20) > 0 ? 1 : 0,
                    bgPattern: (val & 0x10) > 0 ? 1 : 0,
                    spritePattern: (val & 0x08) > 0 ? 1 : 0,
                    nameTable: val & 3
                });
                if (val & 0x4) {
                    this.ppuInc = 32;
                } else {
                    this.ppuInc = 1;
                }
                this.reg.t = (this.reg.t & 0x73ff) | ((val & 3) << 10);
                break;
            case 1: // 2001
                this.famPpu.setConfig2001({
                    bgColor: (val & 0xe0) >> 5,
                    sprite: (val & 0x10) > 0,
                    bg: (val & 0x8) > 0,
                    spriteMask: (val & 0x4) > 0 ? 1 : 0,
                    bgMask: (val & 0x2) > 0 ? 1 : 0
                });
                break;
            case 3: // 2003
                this.spriteAddr = val;
                break;
            case 4: // 2004
                this.famPpu.writeSprite(this.spriteAddr, val);
                this.spriteAddr = (this.spriteAddr + 1) & 0xff;
                break;
            case 5: // 2005
                this.scrollPos[this.scrollIx] = val;
                if (this.scrollIx) {
                    this.famPpu.setScroll(this.scrollPos[0], this.scrollPos[1]);
                    if (this.scrollPos[0] && this.famPpu["config2000"].nameTable) {
                        //debugLogFlag = true;
                    }
                }
                this.scrollIx ^= 1;
                if (this.reg.w) {
                    // second
                    this.reg.t = (this.reg.t & 0xc1f) | ((val & 7) << 12) | ((val & 0xf8) << 2);
                } else {
                    // first
                    this.reg.t = (this.reg.t & 0x7fe0) | (val >> 3);
                    this.reg.x = val & 7;
                }
                this.reg.w = this.reg.w ^ 1;
                break;
            case 6: // 2006
                if (this.scrollIx) {
                    // 下位
                    this.ppuNextAddr = (this.ppuNextAddr & 0xff00) | val;
                    this.ppuAddr = this.ppuNextAddr;
                    // nameTableも変更
                    this.famPpu.setConfig2000({
                        nameTable: (val & 0xc) >> 2
                    });
                } else {
                    // 上位
                    this.ppuNextAddr = (this.ppuNextAddr & 0xff) | (val << 8);
                    if (val >= 0x40) {
                        console.log("PPU OVER");
                    }
                }
                if (this.reg.w) {
                    // second
                    this.reg.t = (this.reg.t & 0x7f00) | val;
                    this.reg.v = this.reg.t;
                } else {
                    // first
                    this.reg.t = (this.reg.t & 0xff) | ((val & 0x3f) << 8);
                }
                this.reg.w = this.reg.w ^ 1;
                this.scrollIx ^= 1;
                break;
            case 7: // 2007
                //console.log("WritePPU:" + Number(this.ppuAddr).toString(16) + " <= " + Number(val).toString(16));
                this.famPpu.write(this.ppuAddr, val);
                /*
                if (this.ppuAddr < 0x2000 || this.ppuAddr >= 0x4000) {
                    console.log("PPU[" + Number(this.ppuAddr).toString(16) + "]=" + val);
                    debugLogFlag = true;
                } else if (this.ppuAddr > 0x2000 && this.ppuAddr < 0x23c0 && debugLogFlag) {
                    console.log("PPU[" + Number(this.ppuAddr).toString(16) + "]=" + val);
                }
                */
                this.ppuAddr += this.ppuInc;
                this.reg.v += this.ppuInc;
                break;
            default:
                break;
        }
    }
    read(addr: number): number {
        switch (addr & 7) {
            case 2: // 2002
                let st = this.famPpu.readState();
                // リセット
                this.scrollIx = 0;
                this.reg.w = 0;
                return (st.scanSprite << 5) | (st.spriteHit ? 0x40 : 0) | (st.vblank ? 0x80 : 0);
            case 7: // 2007
                // PPUは１つ遅れて読み込まれる
                let ret = this.ppuReadData;
                this.ppuReadData = this.famPpu.read(this.ppuAddr);
                this.ppuAddr += this.ppuInc;
                this.reg.v += this.ppuInc;
                return ret;
        }
        return 0;
    }

    /**
     * スキャンライン前の設定
     */
    public preScanLine(): void {
        //this.famPpu.setScroll(this.reg.t )
    }
}

/**
 * 4000-401f
 */
class ApuIoMemory implements IFamMemory {
    private lastButton: number[] = [0, 0];
    private lastWrite: number[] = [0, 0];
    private buttonIndex: number[] = [0, 0];
    private squareLow: number[] = [0, 0];

    constructor(private famData: FamData, private parent: FamMemory) {
    }

    public checkButton(button: number[]): void {
        this.lastButton[0] |= button[0];
        this.lastButton[1] |= button[1];
    }

    write(addr: number, val: number): void {
        if (addr == 0x14) {
            // Sprite DMA
            let memAddr = val << 8;
            for (let i = 0; i < 256; i++) {
                this.famData.ppu.writeSprite(i, this.parent.read(memAddr + i));
            }
        } else if (addr == 0x16 || addr == 0x17) {
            // Controller
            let ix = addr - 0x16;
            if (!val && this.lastWrite[ix]) {
                // reset
                this.lastButton[ix] = 0;
                this.buttonIndex[ix] = 0;
            }
            this.lastWrite[ix] = val;
        } else if (addr < 8) {
            // Square
            let ix = addr >> 2;
            let sq = this.famData.apu.square[ix];
            //console.log("400" + addr + "=" + val);
            switch (addr & 3) {
                case 0:
                    if (val & 0x10) {
                        // Volume
                        sq.setVolume(val >> 6, (val & 0x20) > 0, val & 15);
                    } else {
                        // Emvelope
                        sq.setEnvelope(val >> 6, (val & 0x20) > 0, val & 15);
                    }
                    break;
                case 1:
                    sq.setSweep((val & 0x80) > 0, (val >> 4) & 7, (val >> 3) & 1, val & 7);
                    break;
                case 2:
                    this.squareLow[ix] = val;
                    sq.setTimerRow(val);
                    break;
                case 3:
                    sq.setTimer(val >> 3, ((val & 7) << 8) | this.squareLow[ix]);
                    break;
            }
        } else if (addr == 0x15) {
            // APU Control
            this.famData.apu.square[0].setEnabled((val & 1) > 0);
            this.famData.apu.square[1].setEnabled((val & 2) > 0);
        } else if (addr == 0x17) {
            // mi------
            this.famData.apu.setMode(val >> 7);
        }
    }
    read(addr: number): number {
        if (addr == 0x16 || addr == 0x17) {
            // Controller
            let ix = addr - 0x16;
            let flag = (this.lastButton[ix] | this.famData.button[ix]) & (1 << this.buttonIndex[ix]);
            this.buttonIndex[ix]++;
            return flag ? 1 : 0;
        } else if (addr == 0x15) {
            // apu state read
            let ret = 0;
            if (this.famData.apu.square[0].isPlaing) {
                ret = 1;
            }
            if (this.famData.apu.square[1].isPlaing) {
                ret |= 2;
            }
            return ret;
        }
        return 0;
    }
}

type MemData = {
    memory: IFamMemory;
    start: number;
    end: number;
};

/**
 * メモリ管理できるクラス
 */
class MemManager implements IFamMemory {
    private memList: MemData[] = [];

    write(addr: number, val: number): void {
        let mem = this.getMemory(addr);
        if (mem) {
            mem.memory.write(addr - mem.start, val);
        }
    }
    read(addr: number): number {
        let mem = this.getMemory(addr);
        if (mem) {
            return mem.memory.read(addr - mem.start);
        }
        return 0;
    }
    private getMemory(addr: number): MemData {
        let sx = 0;
        let ex = this.memList.length;
        let cx = Math.floor(ex / 2);
        while (sx < ex) {
            let mem = this.memList[cx];
            if (addr < mem.start) {
                ex = cx;
                cx = Math.floor((sx + ex) / 2);
            } else if (addr >= mem.end) {
                sx = cx + 1;
                cx = Math.floor((sx + ex) / 2);
            } else {
                return mem;
            }
        }
        return null;
    }

    setMemory(mem: IFamMemory, start: number, end: number): MemManager {
        for (let ix = 0; ix < this.memList.length; ix++) {
            if (start <= this.memList[ix].start) {
                // ここに挿入
                let count = 0;
                for (let i = ix; i < this.memList.length; i++) {
                    if (this.memList[i].end > end) {
                        break;
                    }
                    count++;
                }
                this.memList.splice(ix, count, {
                    memory: mem,
                    start: start,
                    end: end
                });
                if (ix > 0 && this.memList[ix - 1].end > start) {
                    // １つ前を縮める
                    this.memList[ix - 1].end = start;
                }
                return this;
            }
        }
        this.memList.push({
            memory: mem,
            start: start,
            end: end
        });
        return this;
    }
}

/**
 * プログラムメモリ管理インタフェース
 */
export interface IPrgMemoryManager {
    init?(memory: FamMemory): void;

    write(memory: FamMemory, addr: number, val: number): void;
}

/**
 * プログラムメモリ
 */
class PrgMemory implements IFamMemory {
    constructor(private parent: FamMemory, private addr: number, private memory: Uint8Array, private manager: IPrgMemoryManager) {
    }

    write(addr: number, val: number): void {
        if (this.manager) {
            this.manager.write(this.parent, addr + this.addr, val);
        }
    }
    read(addr: number): number {
        return this.memory[addr];
    }
}

/**
 * ファミコンのメモリ
 */
export class FamMemory extends MemManager {
    private ppuMem: PpuMemory;
    private ioMem: ApuIoMemory;
    constructor(public readonly famData: FamData, private manager: IPrgMemoryManager) {
        super();
        let wram = new WramMemory(0x800);
        for (let addr = 0; addr < 0x2000; addr += 0x800) {
            this.setMemory(wram, addr, addr + wram.size);
        }
        this.ppuMem = new PpuMemory(famData.ppu, this);
        this.setMemory(this.ppuMem, 0x2000, 0x4000);
        if (this.manager) {
            this.manager.init(this);
        }
        this.ioMem = new ApuIoMemory(famData, this);
        this.setMemory(this.ioMem, 0x4000, 0x4020);
    }
    public get isNmiEnabled(): boolean {
        return this.ppuMem.isNmiEnabled;
    }

    public setPrgMemory(addr: number, mem: Uint8Array): FamMemory {
        this.setMemory(new PrgMemory(this, addr, mem, this.manager), addr, addr + mem.length);
        return this;
    }

    public checkButton(button: number[]): void {
        this.ioMem.checkButton(button);
    }
}

/**
 * NESロム
 */
export class NesRomManager implements IPrgMemoryManager {
    constructor(protected nesRom: NesRomData) {
    }

    init(memory: FamMemory): void {
        memory.famData.ppu.setMirrorMode(this.nesRom.mirrorMode);
        if (this.nesRom.chrSize > 0) {
            memory.famData.ppu.write(0, this.nesRom.getChr(0));
        }
    }
    write(memory: FamMemory, addr: number, val: number): void {
    }
}

class CpuState {
    regA: number = 0;
    regX: number = 0;
    regY: number = 0;
    regPc: number = 0;
    regSp: number = 0xff;
    regFr: number = FR_ON | FR_I;
    private interruptType: "" | "irq" | "reset" | "nmi" | "brk" = "";

    constructor(public readonly memory: FamMemory) {
        this.regPc = this.memory.read(0xfffc) | (this.memory.read(0xfffd) << 8);
    }

    public setInterrupt(type: "" | "irq" | "reset" | "nmi" | "brk"): void {
        this.interruptType = type;
    }
    public get interrupted(): "" | "irq" | "reset" | "nmi" | "brk" {
        return this.interruptType;
    }
};

interface CpuLogFunc {
    hex2(val: number): CpuLogFunc;
    hex4(val: number): CpuLogFunc;
    text(str: string): CpuLogFunc;
    // 現在のを確定してスペースを開ける
    fix(term?: string): CpuLogFunc;
}

const noLogger = new class implements CpuLogFunc {
    hex2(val: number): CpuLogFunc {
        return this;
    }
    hex4(val: number): CpuLogFunc {
        return this;
    }
    text(str: string): CpuLogFunc {
        return this;
    }
    // 現在のを確定してスペースを開ける
    fix(term?: string): CpuLogFunc {
        return this;
    }
};

class CpuTextLogger implements CpuLogFunc {
    private logText: string = "";
    private fixTerm: string = "";

    constructor() {
    }

    hex2(val: number): CpuLogFunc {
        return this.text("$" + ("0" + Number(val & 255).toString(16)).slice(-2).toUpperCase());
    }
    hex4(val: number): CpuLogFunc {
        return this.text("$" + ("000" + Number(val & 0xffff).toString(16)).slice(-4).toUpperCase());
    }
    text(str: string): CpuLogFunc {
        if (this.fixTerm) {
            this.logText += this.fixTerm;
            this.fixTerm = "";
        }
        this.logText += str;
        return this;
    }
    // 現在のを確定してスペースを開ける
    fix(term: string = " "): CpuLogFunc {
        this.fixTerm = term;
        return this;
    }

    public toString(): string {
        return this.logText;
    }
}

class CpuExecData {
    private addr: number;
    private value: number;
    public nextPc: number;
    private bakCpu: any;

    constructor(public readonly state: CpuState, public cycle: number, private logFunc?: CpuLogFunc) {
        this.nextPc = state.regPc + 1;
        if (this.logFunc) {
            this.logFunc.hex4(this.state.regPc).fix();
            this.bakCpu = Object.assign({}, this.state);
        }
    }

    public setAddr(addr: number): CpuExecData {
        this.addr = addr & 0xffff;
        return this;
    }
    public setValue(val: number): CpuExecData {
        this.value = val;
        return this;
    }
    public getAddr(): number {
        return this.addr;
    }

    public getValue(): number {
        if (this.value === undefined) {
            this.value = this.state.memory.read(this.addr);
            this.log(log => log.hex2(this.value).text("=(").hex4(this.addr).text(")").fix(","));
        }
        return this.value;
    }

    public nz(newValue: number): CpuExecData {
        this.value = newValue & 255;
        if (this.value) {
            this.state.regFr &= ~FR_Z;
        } else {
            this.state.regFr |= FR_Z;
        }
        if (this.value & 0x80) {
            this.state.regFr |= FR_N;
        } else {
            this.state.regFr &= ~FR_N;
        }
        return this;
    }
    public nvzc(newValue: number, oldValue?: number): CpuExecData {
        if (oldValue === undefined) {
            oldValue = this.getValue();
        }
        if (newValue & 0x100) {
            this.state.regFr |= FR_C;
        } else {
            this.state.regFr &= ~FR_C;
        }
        this.value = newValue & 255;
        if (this.value) {
            this.state.regFr &= ~FR_Z;
        } else {
            this.state.regFr |= FR_Z;
        }
        if (this.value & 0x80) {
            this.state.regFr |= FR_N;
        } else {
            this.state.regFr &= ~FR_N;
        }
        if ((newValue & 0x40) != (oldValue & 0x40)) {
            this.state.regFr |= FR_V;
        } else {
            this.state.regFr &= ~FR_V;
        }
        return this;
    }
    public nzc(newValue: number, c?: boolean): CpuExecData {
        this.value = newValue & 255;
        if (this.value) {
            this.state.regFr &= ~FR_Z;
        } else {
            this.state.regFr |= FR_Z;
        }
        if (this.value & 0x80) {
            this.state.regFr |= FR_N;
        } else {
            this.state.regFr &= ~FR_N;
        }
        if (typeof c == "boolean") {
            this.state.regFr = (this.state.regFr & ~FR_C) | (c ? FR_C : 0);
        } else {
            if (newValue & 0x100) {
                this.state.regFr |= FR_C;
            } else {
                this.state.regFr &= ~FR_C;
            }
        }
        return this;
    }
    /**
     * これだけ特殊
     */
    public bit(): CpuExecData {
        let val = this.getValue();
        if (this.state.regA & val) {
            this.state.regFr &= ~FR_Z;
        } else {
            this.state.regFr |= FR_Z;
        }
        if (val & 0x80) {
            this.state.regFr |= FR_N;
        } else {
            this.state.regFr &= ~FR_N;
        }
        if (val & 0x40) {
            this.state.regFr |= FR_V;
        } else {
            this.state.regFr &= ~FR_V;
        }
        return this;
    }
    public setFlag(flag: number, mask?: number): CpuExecData {
        if (typeof mask == "number") {
            this.state.regFr = (this.state.regFr & ~mask) | (flag & mask);
        } else {
            this.state.regFr = flag & 255;
        }
        return this;
    }
    public setReg(reg: "A" | "X" | "Y"): CpuExecData {
        this.state["reg" + reg] = this.getValue();
        return this;
    }

    public push8(val?: number): CpuExecData {
        if (val === undefined) {
            val = this.getValue();
        }
        this.state.memory.write(0x100 | this.state.regSp, val);
        this.state.regSp = (this.state.regSp - 1) & 0xff;
        return this;
    }
    public pop8(): number {
        this.state.regSp = (this.state.regSp + 1) & 0xff;
        return this.state.memory.read(0x100 | this.state.regSp);
    }
    public push16(addr?: number): CpuExecData {
        if (addr === undefined) {
            addr = this.getAddr();
        }
        this.push8(addr >> 8);
        this.push8(addr & 255);
        return this;
    }
    public pop16(): number {
        let addr = this.pop8();
        return addr | (this.pop8() << 8);
    }

    public read(addr: number): number {
        return this.state.memory.read(addr);
    }
    public store(val?: number): CpuExecData {
        if (val === undefined) {
            val = this.getValue();
        }
        this.state.memory.write(this.getAddr(), val);
        this.log(log => log.text("(").hex4(this.getAddr()).text(")=").hex2(val).fix(","));
        return this;
    }
    public carry(ret = 1): number {
        return (this.state.regFr & FR_C) ? ret : 0;
    }
    public finish(): void {
        this.state.regPc = this.nextPc;
        if (this.logFunc) {
            // TODO
            const regs = ["regA", "regX", "regY"];
            regs.forEach(key => {
                if (this.bakCpu[key] != this.state[key]) {
                    this.logFunc.text(key.slice(-1) + "=").hex2(this.bakCpu[key]).text("->").hex2(this.state[key]).fix(",");
                } else {
                    this.logFunc.text(key.slice(-1) + "=").hex2(this.state[key]).fix(",");
                }
            });
            const flags = "NV1BDIZC";
            let txt = "P=";
            for (let i = 0; i < 8; i++) {
                if (this.state.regFr & (0x80 >> i)) {
                    txt += flags[i];
                } else {
                    txt += "-";
                }
            }
            this.logFunc.text(txt).fix(",");
            if (this.bakCpu["regSp"] != this.state.regSp) {
                this.logFunc.text("SP=").hex2(this.state.regSp).fix(",");
            }
        }
    }

    public log(func: (log: CpuLogFunc) => void): CpuLogFunc;
    public log(str: string): CpuLogFunc;
    public log(str: any): CpuLogFunc {
        if (this.logFunc) {
            if (typeof str == "string") {
                this.logFunc.text(str);
            } else {
                str(this.logFunc);
            }
            return this.logFunc;
        }
        return noLogger;
    }
}

type CpuExecProc = (data: CpuExecData) => CpuExecData;

const immediate: CpuExecProc = data => {
    data.setValue(data.read(data.nextPc));
    data.nextPc++;
    data.log(log => log.text("#").hex2(data.getValue()).fix(": "));
    return data;
};
const zeroPage: CpuExecProc = data => {
    data.setAddr(data.read(data.nextPc));
    data.nextPc++;
    data.log(log => log.hex2(data.getAddr()).fix(": "));
    return data;
};
const zeroPageX: CpuExecProc = data => {
    data.setAddr((data.read(data.nextPc) + data.state.regX) & 255);
    data.nextPc++;
    data.log(log => log.hex2(data.getAddr() - data.state.regX).text(",X").fix(": "));
    return data;
};
const zeroPageY: CpuExecProc = data => {
    data.setAddr((data.read(data.nextPc) + data.state.regY) & 255);
    data.nextPc++;
    data.log(log => log.hex2(data.getAddr() - data.state.regY).text(",Y").fix(": "));
    return data;
};
const absolute: CpuExecProc = data => {
    data.setAddr(data.read(data.nextPc) | (data.read(data.nextPc + 1) << 8));
    data.nextPc += 2;
    data.log(log => log.hex4(data.getAddr()).fix(": "));
    return data;
};
const absoluteX: CpuExecProc = data => {
    let addr = data.read(data.nextPc) + data.state.regX;
    if (addr & 0x100) {
        // Page Cross
        data.cycle++;
    }
    data.setAddr(addr + (data.read(data.nextPc + 1) << 8));
    data.nextPc += 2;
    data.log(log => log.hex4(data.getAddr() - data.state.regX).text(",X").fix(": "));
    return data;
};
const absoluteY: CpuExecProc = data => {
    let addr = data.read(data.nextPc) + data.state.regY;
    if (addr & 0x100) {
        // Page Cross
        data.cycle++;
    }
    data.setAddr(addr + (data.read(data.nextPc + 1) << 8));
    data.nextPc += 2;
    data.log(log => log.hex4(data.getAddr() - data.state.regY).text(",Y").fix(": "));
    return data;
};
const indirectX: CpuExecProc = data => {
    let ix = data.read(data.nextPc) + data.state.regX;
    data.setAddr(data.read(ix) | (data.read((ix + 1) & 255) << 8));
    data.nextPc++;
    data.log(log => log.text("(").hex2(ix).text(",X)").fix(": "));
    return data;
};
const indirectY: CpuExecProc = data => {
    let ix = data.read(data.nextPc);
    let low = data.read(ix) + data.state.regY;
    data.setAddr((data.read((ix + 1) & 255) << 8) + low);
    if (low & 0x100) {
        // Page Cross
        data.cycle++;
    }
    data.nextPc++;
    data.log(log => log.text("(").hex2(ix).text("),Y").fix(": "));
    return data;
};
const indirectAbsolute: CpuExecProc = data => {
    let low = data.read(data.nextPc);
    let hi = data.read(data.nextPc + 1) << 8;
    data.setAddr(data.read(hi | low) | (data.read(hi | ((low + 1) & 255)) << 8));
    data.log(log => log.text("(").hex4(hi | low).text(")").fix(": "));
    return data;
};

/**
 * CPUの命令
 */
class CpuInstruction {
    private proc: CpuExecProc[] = [];
    private strFunc: (cpu: CpuState) => string;

    constructor(private cpu: CpuState, private cycle: number) {
    }

    public adc(addr: CpuExecProc): CpuInstruction {
        this.proc.push(addr, data => data.nvzc(data.state.regA + data.getValue() + data.carry(1), data.state.regA).setReg("A"));
        return this;
    }
    public sbc(addr: CpuExecProc): CpuInstruction {
        this.proc.push(addr, data => data.nvzc(0x100 + data.state.regA - data.getValue() - (data.carry(1) ^ 1), data.state.regA).setReg("A"));
        return this;
    }
    public and(addr: CpuExecProc): CpuInstruction {
        this.proc.push(addr, data => data.nz(data.state.regA & data.getValue()).setReg("A"));
        return this;
    }
    public ora(addr: CpuExecProc): CpuInstruction {
        this.proc.push(addr, data => data.nz(data.state.regA | data.getValue()).setReg("A"));
        return this;
    }
    public eor(addr: CpuExecProc): CpuInstruction {
        this.proc.push(addr, data => data.nz(data.state.regA ^ data.getValue()).setReg("A"));
        return this;
    }
    public asl(addr?: CpuExecProc): CpuInstruction {
        if (addr) {
            this.proc.push(addr, data => {
                let val = data.getValue();
                return data.nzc(val << 1).store();
            });
        } else {
            this.proc.push(data => {
                let val = data.state.regA;
                return data.nzc(val << 1).setReg("A");
            });
        }
        return this;
    }
    public lsr(addr?: CpuExecProc): CpuInstruction {
        if (addr) {
            this.proc.push(addr, data => {
                let val = data.getValue();
                return data.nzc(val >> 1, (val & 1) > 0).store();
            });
        } else {
            this.proc.push(data => {
                let val = data.state.regA;
                return data.nzc(val >> 1, (val & 1) > 0).setReg("A");
            });
        }
        return this;
    }
    public rol(addr?: CpuExecProc): CpuInstruction {
        if (addr) {
            this.proc.push(addr, data => {
                let val = data.getValue();
                return data.nzc((val << 1) | data.carry()).store();
            });
        } else {
            this.proc.push(data => {
                let val = data.state.regA;
                return data.nzc((val << 1) | data.carry()).setReg("A");
            });
        }
        return this;
    }
    public ror(addr?: CpuExecProc): CpuInstruction {
        if (addr) {
            this.proc.push(addr, data => {
                let val = data.getValue();
                return data.nzc((val >> 1) | data.carry(0x80), (val & 1) > 0).store();
            });
        } else {
            this.proc.push(data => {
                let val = data.state.regA;
                return data.nzc((val >> 1) | data.carry(0x80), (val & 1) > 0).setReg("A");
            });
        }
        return this;
    }
    public relativeJump(check: (flag: number) => boolean): CpuInstruction {
        this.proc.push(data => {
            data.nextPc++;
            data.log(log => {
                let ix = data.read(data.nextPc - 1);
                if (ix & 0x80) {
                    ix -= 0x100;
                }
                return log.hex4(data.nextPc + ix).fix(": ");
            });
            if (check(data.state.regFr)) {
                // Jump
                let ix = data.read(data.nextPc - 1);
                if (ix & 0x80) {
                    ix -= 0x100;
                }
                let pc = data.nextPc + ix;
                if ((data.nextPc & 0x100) != (pc & 0x100)) {
                    // Page Cross
                    data.cycle += 2;
                } else {
                    data.cycle++;
                }
                data.nextPc = pc & 0xffff;
            }
            return data;
        });
        return this;
    }
    public bit(addr: CpuExecProc): CpuInstruction {
        this.proc.push(addr, data => data.bit());
        return this;
    }
    public jump(addr: CpuExecProc): CpuInstruction {
        this.proc.push(addr, data => {
            data.nextPc = data.getAddr();
            return data;
        });
        return this;
    }
    public jsr(): CpuInstruction {
        this.proc.push(absolute, data => {
            data.push16(data.nextPc - 1);
            data.nextPc = data.getAddr();
            return data;
        });
        return this;
    }
    public rts(): CpuInstruction {
        this.proc.push(data => {
            let addr = data.pop16();
            data.nextPc = (addr + 1) & 0xffff;
            return data;
        });
        return this;
    }
    public brk(): CpuInstruction {
        this.proc.push(data => {
            data.state.setInterrupt("brk");
            data.nextPc++;
            return data;
        });
        return this;
    }
    public rti(): CpuInstruction {
        this.proc.push(data => {
            let flag = data.pop8();
            data.nextPc = data.pop16();
            data.setFlag(flag);
            return data;
        });
        return this;
    }
    public cmp(reg: "A" | "X" | "Y", addr: CpuExecProc): CpuInstruction {
        this.proc.push(addr, data => data.nzc(0x100 + data.state["reg" + reg] - data.getValue()));
        return this;
    }
    public inc(reg: CpuExecProc | "X" | "Y"): CpuInstruction {
        if (typeof reg == "string") {
            this.proc.push(data => data.nz(data.state["reg" + reg] + 1).setReg(reg));
        } else {
            this.proc.push(reg, data => data.nz(data.getValue() + 1).store());
        }
        return this;
    }
    public dec(reg: CpuExecProc | "X" | "Y"): CpuInstruction {
        if (typeof reg == "string") {
            this.proc.push(data => data.nz(data.state["reg" + reg] - 1).setReg(reg));
        } else {
            this.proc.push(reg, data => data.nz(data.getValue() - 1).store());
        }
        return this;
    }
    public flag(bit: number, val: boolean): CpuInstruction {
        if (val) {
            this.proc.push(data => data.setFlag(bit, bit));
        } else {
            this.proc.push(data => data.setFlag(0, bit));
        }
        return this;
    }
    public load(reg: "A" | "X" | "Y", addr: CpuExecProc): CpuInstruction {
        this.proc.push(addr, data => data.nz(data.getValue()).setReg(reg));
        return this;
    }
    public store(reg: "A" | "X" | "Y", addr: CpuExecProc): CpuInstruction {
        this.proc.push(addr, data => data.store(data.state["reg" + reg]));
        return this;
    }
    public transfer(from: "A" | "X" | "Y" | "Fr", to: "A" | "X" | "Y" | "Fr"): CpuInstruction {
        if (to == "Fr") {
            // 特殊
            this.proc.push(data => data.setFlag(data.state["reg" + from]));
        } else {
            this.proc.push(data => data.nz(data.state["reg" + from]).setReg(to));
        }
        return this;
    }
    public pha(): CpuInstruction {
        this.proc.push(data => data.push8(data.state.regA));
        return this;
    }
    public pla(): CpuInstruction {
        this.proc.push(data => data.nz(data.pop8()).setReg("A"));
        return this;
    }
    public php(): CpuInstruction {
        this.proc.push(data => data.push8(data.state.regFr));
        return this;
    }
    public plp(): CpuInstruction {
        this.proc.push(data => data.setFlag(data.pop8()));
        return this;
    }

    public execute(logFunc?: CpuLogFunc): number {
        let data = new CpuExecData(this.cpu, this.cycle, logFunc);
        data.log(this.opeName).fix();
        try {
            this.proc.forEach(func => data = func(data));
        } catch (e) {
            console.log(e);
            throw e;
        }
        data.finish();
        return data.cycle;
    }

    private opeName: string;

    public name(nm: string): CpuInstruction {
        this.opeName = nm;
        return this;
    }
}

const FR_N = 0x80;
const FR_V = 0x40;
const FR_ON = 0x20;
const FR_B = 0x10;
const FR_D = 8;
const FR_I = 4;
const FR_Z = 2;
const FR_C = 1;

export class FamCpu {
    public cycle: number = 0;
    private cpuState: CpuState;
    private opeMap: { [code: number]: CpuInstruction } = {};

    constructor(private memory: FamMemory) {
        this.reset();
        this.init();
    }

    public reset(): void {
        this.cycle = 6;
        this.cpuState = new CpuState(this.memory);
    }

    private entry(code: number, cycle: number): CpuInstruction {
        if (this.opeMap[code]) {
            throw "二重登録:" + code;
        }
        let inst = new CpuInstruction(this.cpuState, cycle);
        this.opeMap[code] = inst;
        return inst;
    }

    init() {
        // ADC
        this.entry(0x69, 2).name("ADC").adc(immediate);
        this.entry(0x65, 3).name("ADC").adc(zeroPage);
        this.entry(0x75, 4).name("ADC").adc(zeroPageX);
        this.entry(0x6d, 4).name("ADC").adc(absolute);
        this.entry(0x7d, 4).name("ADC").adc(absoluteX);
        this.entry(0x79, 4).name("ADC").adc(absoluteY);
        this.entry(0x61, 6).name("ADC").adc(indirectX);
        this.entry(0x71, 5).name("ADC").adc(indirectY);

        // SBC
        this.entry(0xe9, 2).name("SBC").sbc(immediate);
        this.entry(0xe5, 3).name("SBC").sbc(zeroPage);
        this.entry(0xf5, 4).name("SBC").sbc(zeroPageX);
        this.entry(0xed, 4).name("SBC").sbc(absolute);
        this.entry(0xfd, 4).name("SBC").sbc(absoluteX);
        this.entry(0xf9, 4).name("SBC").sbc(absoluteY);
        this.entry(0xe1, 6).name("SBC").sbc(indirectX);
        this.entry(0xf1, 5).name("SBC").sbc(indirectY);

        // AND
        this.entry(0x29, 2).name("AND").and(immediate);
        this.entry(0x25, 3).name("AND").and(zeroPage);
        this.entry(0x35, 4).name("AND").and(zeroPageX);
        this.entry(0x2d, 4).name("AND").and(absolute);
        this.entry(0x3d, 4).name("AND").and(absoluteX);
        this.entry(0x39, 4).name("AND").and(absoluteY);
        this.entry(0x21, 6).name("AND").and(indirectX);
        this.entry(0x31, 5).name("AND").and(indirectY);

        // ORA
        this.entry(0x09, 2).name("ORA").ora(immediate);
        this.entry(0x05, 3).name("ORA").ora(zeroPage);
        this.entry(0x15, 4).name("ORA").ora(zeroPageX);
        this.entry(0x0d, 4).name("ORA").ora(absolute);
        this.entry(0x1d, 4).name("ORA").ora(absoluteX);
        this.entry(0x19, 4).name("ORA").ora(absoluteY);
        this.entry(0x01, 6).name("ORA").ora(indirectX);
        this.entry(0x11, 5).name("ORA").ora(indirectY);

        // EOR
        this.entry(0x49, 2).name("EOR").eor(immediate);
        this.entry(0x45, 3).name("EOR").eor(zeroPage);
        this.entry(0x55, 4).name("EOR").eor(zeroPageX);
        this.entry(0x4d, 4).name("EOR").eor(absolute);
        this.entry(0x5d, 4).name("EOR").eor(absoluteX);
        this.entry(0x59, 4).name("EOR").eor(absoluteY);
        this.entry(0x41, 6).name("EOR").eor(indirectX);
        this.entry(0x51, 5).name("EOR").eor(indirectY);

        // ASL
        this.entry(0x0a, 2).name("ASL").asl();
        this.entry(0x06, 5).name("ASL").asl(zeroPage);
        this.entry(0x16, 6).name("ASL").asl(zeroPageX);
        this.entry(0x0e, 6).name("ASL").asl(absolute);
        this.entry(0x1e, 6).name("ASL").asl(absoluteX);

        // LSR
        this.entry(0x4a, 2).name("LSR").lsr();
        this.entry(0x46, 5).name("LSR").lsr(zeroPage);
        this.entry(0x56, 6).name("LSR").lsr(zeroPageX);
        this.entry(0x4e, 6).name("LSR").lsr(absolute);
        this.entry(0x5e, 6).name("LSR").lsr(absoluteX);

        // ROL
        this.entry(0x2a, 2).name("ROL").rol();
        this.entry(0x26, 5).name("ROL").rol(zeroPage);
        this.entry(0x36, 6).name("ROL").rol(zeroPageX);
        this.entry(0x2e, 6).name("ROL").rol(absolute);
        this.entry(0x3e, 6).name("ROL").rol(absoluteX);


        // ROR
        this.entry(0x6a, 2).name("ROR").ror();
        this.entry(0x66, 5).name("ROR").ror(zeroPage);
        this.entry(0x76, 6).name("ROR").ror(zeroPageX);
        this.entry(0x6e, 6).name("ROR").ror(absolute);
        this.entry(0x7e, 6).name("ROR").ror(absoluteX);

        // Relative Jump
        // BCC
        this.entry(0x90, 2).name("BCC")
            .relativeJump(fr => (fr & FR_C) == 0);
        // BCS
        this.entry(0xb0, 2).name("BCS")
            .relativeJump(fr => (fr & FR_C) > 0);
        // BEQ
        this.entry(0xf0, 2).name("BEQ")
            .relativeJump(fr => (fr & FR_Z) > 0);
        // BNE
        this.entry(0xd0, 2).name("BNE")
            .relativeJump(fr => (fr & FR_Z) == 0);
        // BVC
        this.entry(0x50, 2).name("BVC")
            .relativeJump(fr => (fr & FR_V) == 0);
        // BVS
        this.entry(0x70, 2).name("BVS")
            .relativeJump(fr => (fr & FR_V) > 0);
        // BPL
        this.entry(0x10, 2).name("BPL")
            .relativeJump(fr => (fr & FR_N) == 0);
        // BMI
        this.entry(0x30, 2).name("BMI")
            .relativeJump(fr => (fr & FR_N) > 0);

        // BIT
        // N 対象の bit7, V:対象の bit6,Z: A&対象==0
        this.entry(0x24, 3).name("BIT").bit(zeroPage);
        this.entry(0x2c, 4).name("BIT").bit(absolute);

        // JMP
        this.entry(0x4c, 3).name("JMP").jump(absolute);
        this.entry(0x6c, 5).name("JMP").jump(indirectAbsolute);

        // JSR
        this.entry(0x20, 6).name("JSR").jsr();
        // RTS
        this.entry(0x60, 6).name("RTS").rts();
        // BRK
        this.entry(0x00, 7).name("BRK").brk();
        // RTI
        this.entry(0x40, 6).name("RTI").rti();

        // CMP
        this.entry(0xc9, 2).name("CMP").cmp("A", immediate);
        this.entry(0xc5, 3).name("CMP").cmp("A", zeroPage);
        this.entry(0xd5, 4).name("CMP").cmp("A", zeroPageX);
        this.entry(0xcd, 4).name("CMP").cmp("A", absolute);
        this.entry(0xdd, 4).name("CMP").cmp("A", absoluteX);
        this.entry(0xd9, 4).name("CMP").cmp("A", absoluteY);
        this.entry(0xc1, 6).name("CMP").cmp("A", indirectX);
        this.entry(0xd1, 5).name("CMP").cmp("A", indirectY);
        // CPX
        this.entry(0xe0, 2).name("CPX").cmp("X", immediate);
        this.entry(0xe4, 3).name("CPX").cmp("X", zeroPage);
        this.entry(0xec, 4).name("CPX").cmp("X", absolute);
        // CPY
        this.entry(0xc0, 2).name("CPY").cmp("Y", immediate);
        this.entry(0xc4, 3).name("CPY").cmp("Y", zeroPage);
        this.entry(0xcc, 4).name("CPY").cmp("Y", absolute);

        // INC
        this.entry(0xe6, 5).name("INC").inc(zeroPage);
        this.entry(0xf6, 6).name("INC").inc(zeroPageX);
        this.entry(0xee, 6).name("INC").inc(absolute);
        this.entry(0xfe, 6).name("INC").inc(absoluteX);

        // DEC
        this.entry(0xc6, 5).name("DEC").dec(zeroPage);
        this.entry(0xd6, 6).name("DEC").dec(zeroPageX);
        this.entry(0xce, 6).name("DEC").dec(absolute);
        this.entry(0xde, 6).name("DEC").dec(absoluteX);

        // INX
        this.entry(0xe8, 2).name("INX").inc("X");
        // DEX
        this.entry(0xca, 2).name("DEX").dec("X");
        // INY
        this.entry(0xc8, 2).name("INY").inc("Y");
        // DEY
        this.entry(0x88, 2).name("DEY").dec("Y");

        // CLC
        this.entry(0x18, 2).name("CLC").flag(FR_C, false);
        // SEC
        this.entry(0x38, 2).name("SEC").flag(FR_C, true);
        // CLI
        this.entry(0x58, 2).name("CLI").flag(FR_I, false);
        // SEI
        this.entry(0x78, 2).name("SEI").flag(FR_I, true);
        // CLD
        this.entry(0xd8, 2).name("CLD").flag(FR_D, false);
        // SED
        this.entry(0xf8, 2).name("SED").flag(FR_D, true);
        // CLV
        this.entry(0xb8, 2).name("CLV").flag(FR_V, false);

        // LDA
        this.entry(0xa9, 2).name("LDA").load("A", immediate);
        this.entry(0xa5, 3).name("LDA").load("A", zeroPage);
        this.entry(0xb5, 4).name("LDA").load("A", zeroPageX);
        this.entry(0xad, 4).name("LDA").load("A", absolute);
        this.entry(0xbd, 4).name("LDA").load("A", absoluteX);
        this.entry(0xb9, 4).name("LDA").load("A", absoluteY);
        this.entry(0xa1, 6).name("LDA").load("A", indirectX);
        this.entry(0xb1, 5).name("LDA").load("A", indirectY);
        // LDX
        this.entry(0xa2, 2).name("LDX").load("X", immediate);
        this.entry(0xa6, 3).name("LDX").load("X", zeroPage);
        this.entry(0xb6, 4).name("LDX").load("X", zeroPageY);
        this.entry(0xae, 4).name("LDX").load("X", absolute);
        this.entry(0xbe, 4).name("LDX").load("X", absoluteY);
        // LDY
        this.entry(0xa0, 2).name("LDY").load("Y", immediate);
        this.entry(0xa4, 3).name("LDY").load("Y", zeroPage);
        this.entry(0xb4, 4).name("LDY").load("Y", zeroPageX);
        this.entry(0xac, 4).name("LDY").load("Y", absolute);
        this.entry(0xbc, 4).name("LDY").load("Y", absoluteX);

        // STA
        this.entry(0x85, 3).name("STA").store("A", zeroPage);
        this.entry(0x95, 4).name("STA").store("A", zeroPageX);
        this.entry(0x8d, 4).name("STA").store("A", absolute);
        this.entry(0x9d, 4).name("STA").store("A", absoluteX);
        this.entry(0x99, 4).name("STA").store("A", absoluteY);
        this.entry(0x81, 6).name("STA").store("A", indirectX);
        this.entry(0x91, 5).name("STA").store("A", indirectY);
        // STX
        this.entry(0x86, 3).name("STX").store("X", zeroPage);
        this.entry(0x96, 4).name("STX").store("X", zeroPageY);
        this.entry(0x8e, 4).name("STX").store("X", absolute);
        // STY
        this.entry(0x84, 3).name("STY").store("Y", zeroPage);
        this.entry(0x94, 4).name("STY").store("Y", zeroPageX);
        this.entry(0x8c, 4).name("STY").store("Y", absolute);

        // TAX
        this.entry(0xaa, 2).name("TAX").transfer("A", "X");
        // TXA
        this.entry(0x8a, 2).name("TXA").transfer("X", "A");
        // TAY
        this.entry(0xa8, 2).name("TAY").transfer("A", "Y");
        // TYA
        this.entry(0x98, 2).name("TYA").transfer("Y", "A");
        // TXS
        this.entry(0x9a, 2).name("TXS").transfer("X", "Fr");
        // TSX
        this.entry(0xba, 2).name("TSX").transfer("Fr", "X");

        // PHA
        this.entry(0x48, 3).name("PHA").pha();
        // PLA
        this.entry(0x68, 4).name("PLA").pla();
        // PHP
        this.entry(0x08, 3).name("PHP").php();
        // PLP
        this.entry(0x28, 4).name("PLP").plp();

        // NOP
        this.entry(0xea, 2).name("NOP");
    }

    private debugCode: string[] = [];
    private errorFlag = false;

    public execute(line: number): void {
        //const scanClock = 114;
        const scanClock = 114;  // 341PPU / 3:  1PPU=3CPU cycle
        if (line == 241) {
            // VBlank
            if (this.memory.isNmiEnabled) {
                //this.cpuState.setInterrupt("nmi");
                this.cycle += this.interrupt("nmi");
                //this.debugLog = true;
            }
        }
        while (this.cycle < scanClock) {
            if (this.cpuState.interrupted && !(this.cpuState.regFr & FR_I)) {
                let type = this.cpuState.interrupted;
                this.cycle += this.interrupt(type);
                continue;
            }
            let code = this.memory.read(this.cpuState.regPc);
            if (!this.errorFlag && this.cpuState.regPc < 0x8000) {
                this.errorFlag = true;
                console.log(this.debugCode);
                console.log(this.cpuState);
                for (let i = 0x1f0; i < 0x200; i++) {
                    console.log(Number(i).toString(16) + ":" + Number(this.memory.read(i)).toString(16));
                }
            }
            let ope = this.opeMap[code];
            if (this.cpuState.regPc < 0x8000) {
                console.log("ERROR");
                console.log(this.debugCode);
            }
            if (ope) {
                if (debugLogFlag && this.cpuState.regPc != 0x8057) {
                    let log = new CpuTextLogger();
                    this.cycle += ope.execute(log);
                    this.debugCode.push(log.toString());
                    if (this.debugCode.length > 10) {
                        this.debugCode.splice(0, 1);
                    }
                    console.log(log.toString());
                } else {
                    this.cycle += ope.execute();
                }
            } else {
                console.log("No Code:" + Number(code).toString(16));
                console.log(this.debugCode);
                this.cpuState.regPc = (this.cpuState.regPc + 1) & 0xffff;
                this.cycle += 20;
            }
        }
        this.cycle -= scanClock;
    }

    private push(val: number): void {
        this.memory.write(this.cpuState.regSp | 0x100, val);
        this.cpuState.regSp = (this.cpuState.regSp - 1) & 0xff;
    }

    private interrupt(type: "irq" | "nmi" | "reset" | "brk"): number {
        let nextPc = this.cpuState.regPc;
        switch (type) {
            case "nmi":
                this.cpuState.regFr &= ~FR_B;
                nextPc = this.memory.read(0xfffa) | (this.memory.read(0xfffb) << 8);
                break;
            case "brk":
                this.cpuState.regFr |= FR_B;
                nextPc = this.memory.read(0xfffe) | (this.memory.read(0xffff) << 8);
                break;
            default:
                return 0;
        }
        if (debugLogFlag) {
            console.log("INTERRUPT:" + type);
        }
        this.push(this.cpuState.regPc >> 8);
        this.push(this.cpuState.regPc & 0xff);
        this.push(this.cpuState.regFr);
        this.cpuState.regPc = nextPc;
        this.cpuState.regFr |= FR_I;
        this.cpuState.setInterrupt("");
        return 6;
    }
}

export class FamUtil {
    public load(url: string): Promise<NesRomData> {
        return NesRomData.load(url);
    }
    public getMemory(data: FamData, manager?: IPrgMemoryManager): FamMemory {
        return new FamMemory(data, manager);
    }
    public readonly NesRomManager = NesRomManager;

    public readonly FamCpu = FamCpu;
}

export default FamUtil;