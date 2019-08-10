import { FamData, IFamPPU } from "./fam-api";
import { debuglog } from "util";

const PRG_SIZE = 0x4000;
const CHR_SIZE = 0x2000;

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
    private ppuInc: number = 1;
    private ppuFlag: boolean;
    private spriteAddr: number;
    private scrollIx: number;
    private scrollPos: number[];

    constructor(private famPpu: IFamPPU, private parent: IFamMemory) {
        this.reset();
    }

    reset() {
        this.famPpu.reset();
        this.nmiFlag = false;
        this.ppuAddr = 0;
        this.ppuInc = 1;
        this.ppuFlag = false;
        this.spriteAddr = 0;
        this.scrollIx = 0;
        this.scrollPos = [0, 0];
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
                this.scrollIx ^= 1;
                if (!this.scrollIx) {
                    this.famPpu.setScroll(this.scrollPos[0], this.scrollPos[1]);
                }
                break;
            case 6: // 2006
                if (this.ppuFlag) {
                    // 下位
                    this.ppuAddr = (this.ppuAddr & 0xff00) | val;
                } else {
                    // 上位
                    this.ppuAddr = (this.ppuAddr & 0xff) | (val << 8);
                }
                this.ppuFlag = !this.ppuFlag;
                break;
            case 7: // 2007
                //console.log("WritePPU:" + Number(this.ppuAddr).toString(16) + " <= " + Number(val).toString(16));
                this.famPpu.write(this.ppuAddr, val);
                if (this.ppuAddr < 0x2000) {
                    console.log("PPU[" + Number(this.ppuAddr).toString(16) + "=" + val);
                } else if (this.ppuAddr > 0x2100 && this.ppuAddr < 0x2200) {
                    console.log("PPU[" + Number(this.ppuAddr).toString(16) + "=" + val);
                }
                this.ppuAddr += this.ppuInc;
                break;
            default:
                break;
        }
    }
    read(addr: number): number {
        switch (addr & 7) {
            case 2: // 2002
                let st = this.famPpu.readState();
                return (st.scanSprite << 5) | (st.spriteHit ? 0x40 : 0) | (st.vblank ? 0x80 : 0);
            case 7: // 2007
                let ret = this.famPpu.read(this.ppuAddr);
                this.ppuAddr += this.ppuInc;
                return ret;
        }
        return 0;
    }
}

/**
 * 4000-401f
 */
class ApuIoMemory implements IFamMemory {
    constructor(private famData: FamData, private parent: FamMemory) {

    }

    write(addr: number, val: number): void {
        if (addr == 0x14) {
            // Sprite DMA
            let memAddr = val << 8;
            for (let i = 0; i < 256; i++) {
                this.famData.ppu.writeSprite(i, this.parent.read(memAddr + i));
            }
        }
    }
    read(addr: number): number {
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
        this.setMemory(new ApuIoMemory(famData, this), 0x4000, 0x4020);
    }
    public get isNmiEnabled(): boolean {
        return this.ppuMem.isNmiEnabled;
    }

    public setPrgMemory(addr: number, mem: Uint8Array): FamMemory {
        this.setMemory(new PrgMemory(this, addr, mem, this.manager), addr, addr + mem.length);
        return this;
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

type CpuData = {
    value?: number;
    addr?: number;
    newPc?: number;
    newFlag?: number;
    cycle?: number;
};

type CpuProc = (data?: CpuData) => CpuData;

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

class CpuExecData {
    private addr: number;
    private value: number;
    public nextPc: number;

    constructor(public readonly state: CpuState, public cycle: number) {
        this.nextPc = state.regPc + 1;
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
            oldValue = this.value;
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
        return this;
    }
}

type CpuExecProc = (data: CpuExecData) => CpuExecData;

const immediate: CpuExecProc = data => {
    data.setValue(data.read(data.nextPc));
    data.nextPc++;
    return data;
};
const zeroPage: CpuExecProc = data => {
    data.setAddr(data.read(data.nextPc));
    data.nextPc++;
    return data;
};
const zeroPageX: CpuExecProc = data => {
    data.setAddr((data.read(data.nextPc) + data.state.regX) & 255);
    data.nextPc++;
    return data;
};
const zeroPageY: CpuExecProc = data => {
    data.setAddr((data.read(data.nextPc) + data.state.regY) & 255);
    data.nextPc++;
    return data;
};
const absolute: CpuExecProc = data => {
    data.setAddr(data.read(data.nextPc) | (data.read(data.nextPc) << 8));
    data.nextPc += 2;
    return data;
};
const absoluteX: CpuExecProc = data => {
    let addr = data.read(data.nextPc) + data.state.regX;
    if (addr & 0x100) {
        // Page Cross
        data.cycle++;
    }
    data.setAddr(addr + (data.read(data.nextPc) << 8));
    data.nextPc += 2;
    return data;
};
const absoluteY: CpuExecProc = data => {
    let addr = data.read(data.nextPc) + data.state.regY;
    if (addr & 0x100) {
        // Page Cross
        data.cycle++;
    }
    data.setAddr(addr + (data.read(data.nextPc) << 8));
    data.nextPc += 2;
    return data;
};
const indirectX: CpuExecProc = data => {
    let ix = data.read(data.nextPc) + data.state.regX;
    data.setAddr(data.read(ix) | (data.read((ix + 1) & 255) << 8));
    data.nextPc++;
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
    return data;
};

// Debug
const toHex = (val: number) => ("0" + Number(val).toString(16)).substr(-2);

const immediateStr = (cpu: CpuState) => "#$" + toHex(cpu.memory.read(cpu.regPc + 1));
const zeroPageStr = (cpu: CpuState) => "$" + toHex(cpu.memory.read(cpu.regPc + 1));
const zeroPageXStr = (cpu: CpuState) => "$" + toHex(cpu.memory.read(cpu.regPc + 1)) + ",X";
const zeroPageYStr = (cpu: CpuState) => "$" + toHex(cpu.memory.read(cpu.regPc + 1)) + ",Y";
const absoluteStr = (cpu: CpuState) => "$" + toHex(cpu.memory.read(cpu.regPc + 2)) + toHex(cpu.memory.read(cpu.regPc + 1));
const absoluteXStr = (cpu: CpuState) => "$" + toHex(cpu.memory.read(cpu.regPc + 2)) + toHex(cpu.memory.read(cpu.regPc + 1)) + ",X";
const absoluteYStr = (cpu: CpuState) => "$" + toHex(cpu.memory.read(cpu.regPc + 2)) + toHex(cpu.memory.read(cpu.regPc + 1)) + ",Y";
const indirectXStr = (cpu: CpuState) => "($" + toHex(cpu.memory.read(cpu.regPc + 1)) + ",X)";
const indirectYStr = (cpu: CpuState) => "($" + toHex(cpu.memory.read(cpu.regPc + 1)) + "),Y";
const indirectAbsoluteStr = (cpu: CpuState) => "($" + toHex(cpu.memory.read(cpu.regPc + 2)) + toHex(cpu.memory.read(cpu.regPc + 1)) + ")";
const relativeStr = (cpu: CpuState) => {
    let addr = cpu.regPc + 2;
    let ix = cpu.memory.read(cpu.regPc + 1);
    if (ix & 0x80) {
        ix -= 0x100;
    }
    addr += ix;
    return "$" + toHex(addr >> 8) + toHex(addr & 0xff);
};

/**
 * CPUの命令
 */
class CpuInstruction {
    private proc: CpuProc[] = [];
    private strFunc: (cpu: CpuState) => string;

    constructor(private cpu: CpuState, private cycle: number) {
    }


    immediate(): CpuInstruction {
        this.strFunc = immediateStr;
        this.proc.push(data => {
            return {
                value: this.cpu.memory.read(data.newPc),
                newPc: data.newPc + 1
            };
        });
        return this;
    }

    absolute(): CpuInstruction {
        this.strFunc = absoluteStr;
        this.proc.push(data => {
            return {
                addr: this.cpu.memory.read(data.newPc) | (this.cpu.memory.read(data.newPc + 1) << 8),
                newPc: data.newPc + 2
            };
        });
        return this;
    }

    zeroPage(): CpuInstruction {
        this.strFunc = zeroPageStr;
        this.proc.push(data => {
            return {
                addr: this.cpu.memory.read(data.newPc),
                newPc: data.newPc + 1
            };
        });
        return this;
    }

    zeroPageX(): CpuInstruction {
        this.strFunc = zeroPageXStr;
        this.proc.push(data => {
            return {
                addr: (this.cpu.memory.read(data.newPc) + this.cpu.regX) & 0xff,
                newPc: data.newPc + 1
            };
        });
        return this;
    }
    zeroPageY(): CpuInstruction {
        this.strFunc = zeroPageYStr;
        this.proc.push(data => {
            return {
                addr: (this.cpu.memory.read(data.newPc) + this.cpu.regY) & 0xff,
                newPc: data.newPc + 1
            };
        });
        return this;
    }
    absoluteX(): CpuInstruction {
        this.strFunc = absoluteXStr;
        this.proc.push(data => {
            let addr = this.cpu.memory.read(data.newPc) + this.cpu.regX;
            if (addr & 0x100) {
                data.cycle++;
            }
            return {
                addr: ((this.cpu.memory.read(data.newPc + 1) << 8) + addr) & 0xffff,
                newPc: data.newPc + 2
            };
        });
        return this;
    }
    absoluteY(): CpuInstruction {
        this.strFunc = absoluteYStr;
        this.proc.push(data => {
            let addr = this.cpu.memory.read(data.newPc) + this.cpu.regY;
            if (addr & 0x100) {
                data.cycle++;
            }
            return {
                addr: ((this.cpu.memory.read(data.newPc + 1) << 8) + addr) & 0xffff,
                newPc: data.newPc + 2
            };
        });
        return this;
    }
    relative(check: (fr: number) => boolean): CpuInstruction {
        this.strFunc = relativeStr;
        this.proc.push(data => {
            if (check(this.cpu.regFr)) {
                // 分岐する
                data.cycle++;
                let ix = this.cpu.memory.read(data.newPc);
                if (ix & 0x80) {
                    ix -= 0x100;
                }
                let newPc = (data.newPc + 1 + ix) & 0xffff;
                if ((data.newPc >> 8) != (newPc >> 8)) {
                    // ページクロス
                    data.cycle++;
                }
                return {
                    newPc: newPc
                };
            }
            // 分岐しない
            return {
                newPc: data.newPc + 1
            };
        });
        return this;
    }

    indirectX(): CpuInstruction {
        this.strFunc = indirectXStr;
        this.proc.push(data => {
            let ix = (this.cpu.memory.read(data.newPc) + this.cpu.regX) & 0xff;
            return {
                addr: this.cpu.memory.read(ix) | (this.cpu.memory.read((ix + 1) & 0xff) << 8),
                newPc: data.newPc + 1
            };
        });
        return this;
    }

    indirectY(): CpuInstruction {
        this.strFunc = indirectYStr;
        this.proc.push(data => {
            let ix = this.cpu.memory.read(data.newPc);
            let addr = this.cpu.memory.read(ix) | (this.cpu.memory.read((ix + 1) & 0xff) << 8);
            let newAddr = (addr + this.cpu.regY) & 0xffff;
            if ((addr >> 8) != (newAddr >> 8)) {
                // ページクロス
                data.cycle++;
            }
            return {
                addr: newAddr,
                newPc: data.newPc + 1
            };
        });
        return this;
    }

    absoluteIndirect(): CpuInstruction {
        this.strFunc = indirectAbsoluteStr;
        this.proc.push(data => {
            let ix1 = this.cpu.memory.read(data.newPc);
            let ix2 = (this.cpu.memory.read(data.newPc + 1) << 8);
            return {
                addr: this.cpu.memory.read(ix1 | ix2) | (this.cpu.memory.read(((ix1 + 1) & 0xff) | ix2) << 8),
                newPc: data.newPc + 2
            };
        });
        return this;
    }

    /**
     * 処理結果によりフラグを書き換える
     * @param ope 計算処理
     * @param flag 変更するフラグ
     */
    calc(ope: (val?: number, cpu?: CpuState) => number | [number, number] | [number, boolean], flag = FR_N | FR_Z): CpuInstruction {
        this.proc.push(data => {
            let newVal = data.value;
            let newFr = data.newFlag;
            let res = ope(data.value, this.cpu);
            if (typeof res == "number") {
                newVal = res;
            } else {
                // 複数
                newVal = res[0];
                if ((flag & FR_V) && typeof res[1] == "number") {
                    if ((res[0] & 0x80) != ((res[1] as number) & 0x80)) {
                        newFr |= FR_V;
                    } else {
                        newFr &= ~FR_V;
                    }
                }
            }
            if (flag & FR_C) {
                if (Array.isArray(res) && typeof res[1] == "boolean") {
                    // 直接
                    if (res[1]) {
                        newFr |= FR_C;
                    } else {
                        newFr &= ~FR_C;
                    }
                } else if (newVal & 0x100) {
                    newFr |= FR_C;
                } else {
                    newFr &= ~FR_C;
                }
            }
            if (flag & FR_N) {
                if (newVal & 0x80) {
                    newFr |= FR_N;
                } else {
                    newFr &= ~FR_N;
                }
            }
            if (flag & FR_Z) {
                if (newVal & 0xff) {
                    newFr &= ~FR_Z;
                } else {
                    newFr |= FR_Z;
                }
            }
            return {
                value: newVal & 0xff,
                newFlag: newFr
            };
        });
        return this;
    }

    /**
     * メモリからロード
     */
    load(): CpuInstruction {
        this.proc.push(data => {
            return {
                value: this.cpu.memory.read(data.addr)
            };
        });
        return this;
    }

    /**
     * メモリへ書き込む
     * @param res 
     */
    store(res?: (cpu?: CpuState) => number): CpuInstruction {
        this.proc.push(data => {
            let val = data.value;
            if (res) {
                val = res(this.cpu) & 0xff;
            }
            this.cpu.memory.write(data.addr, val);
            return {
                value: val
            };
        });
        return this;
    }

    jump(): CpuInstruction {
        this.proc.push(data => {
            return {
                newPc: data.addr
            };
        });
        return this;
    }

    /**
     * フラグを変えない処理
     * @param ope 
     */
    ope(ope: (val?: number, cpu?: CpuState) => number): CpuInstruction {
        this.proc.push(data => {
            return {
                value: ope(data.value, this.cpu) & 0xff
            };
        });
        return this;
    }

    /**
     * Aレジスタへ設定する
     * @param flag N/Zフラグも変更するか
     */
    setA(flag = false): CpuInstruction {
        if (flag) {
            this.proc.push(data => {
                this.cpu.regA = data.value;
                if (data.value & 0x80) {
                    data.newFlag |= FR_N;
                } else {
                    data.newFlag &= ~FR_N;
                }
                if (data.value) {
                    data.newFlag &= ~FR_Z;
                } else {
                    data.newFlag |= FR_Z;
                }
                return {};
            });
        } else {
            this.proc.push(data => {
                this.cpu.regA = data.value;
                return {};
            });
        }
        return this;
    }
    setX(): CpuInstruction {
        this.proc.push(data => {
            this.cpu.regX = data.value;
            if (data.value & 0x80) {
                data.newFlag |= FR_N;
            } else {
                data.newFlag &= ~FR_N;
            }
            if (data.value) {
                data.newFlag &= ~FR_Z;
            } else {
                data.newFlag |= FR_Z;
            }
            return {};
        });
        return this;
    }
    setY(): CpuInstruction {
        this.proc.push(data => {
            this.cpu.regY = data.value;
            if (data.value & 0x80) {
                data.newFlag |= FR_N;
            } else {
                data.newFlag &= ~FR_N;
            }
            if (data.value) {
                data.newFlag &= ~FR_Z;
            } else {
                data.newFlag |= FR_Z;
            }
            return {};
        });
        return this;
    }

    jsr(): CpuInstruction {
        this.proc.push(data => {
            this.push16(data.newPc - 1);
            return {
                newPc: data.addr
            };
        });
        return this;
    }
    rts(): CpuInstruction {
        this.proc.push(data => {
            return {
                newPc: this.pop16() + 1
            };
        });
        return this;
    }
    brk(): CpuInstruction {
        this.proc.push(data => {
            if (this.cpu.regFr & FR_I) {
                // 割り込み処理中
                // TODO
                return {};
            }
            this.cpu.setInterrupt("brk");
            return {
                newPc: data.addr + 1
            };
        });
        return this;
    }
    rti(): CpuInstruction {
        this.proc.push(data => {
            let newFr = this.pop8();
            return {
                newFlag: newFr & ~FR_I,
                newPc: this.pop16()
            };
        });
        return this;
    }
    setFlag(proc: (fr: number, cpu?: CpuState) => number): CpuInstruction {
        this.proc.push(data => {
            return {
                newFlag: proc(data.newFlag, this.cpu)
            };
        });
        return this;
    }
    pushA(): CpuInstruction {
        this.proc.push(data => {
            this.push8(this.cpu.regA);
            return {};
        });
        return this;
    }
    pushP(): CpuInstruction {
        this.proc.push(data => {
            this.push8(this.cpu.regFr);
            return {};
        });
        return this;
    }
    popA(): CpuInstruction {
        this.proc.push(data => {
            return {
                value: this.pop8()
            };
        });
        this.setA(true);
        return this;
    }
    popP(): CpuInstruction {
        this.proc.push(data => {
            return {
                newFlag: this.pop8()
            };
        });
        return this;
    }

    private push8(val: number): void {
        this.cpu.memory.write(0x100 | this.cpu.regSp, val);
        this.cpu.regSp = (this.cpu.regSp - 1) & 0xff;
    }
    private push16(addr: number): void {
        this.push8(addr >> 8);
        this.push8(addr & 0xff);
    }
    private pop8(): number {
        this.cpu.regSp = (this.cpu.regSp + 1) & 0xff;
        let ret = this.cpu.memory.read(0x100 | this.cpu.regSp);
        return ret;
    }
    private pop16(): number {
        let addr = this.pop8();
        addr |= (this.pop8() << 8);
        return addr;
    }

    exec(): number {
        let data: CpuData = {
            newPc: (this.cpu.regPc + 1) & 0xffff,
            newFlag: this.cpu.regFr,
            cycle: this.cycle
        };
        this.proc.forEach(p => Object.assign(data, p(data)));
        this.cpu.regPc = data.newPc & 0xffff;
        this.cpu.regFr = data.newFlag;
        return data.cycle;
    }

    private opeName: string;

    public name(nm: string): CpuInstruction {
        this.opeName = nm;
        return this;
    }

    public toString(cpu: CpuState): string {
        let ret = this.opeName || toHex(cpu.memory.read(cpu.regPc));
        if (this.strFunc) {
            ret += " " + this.strFunc(cpu);
        }
        return ret;
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
        let adc = (val: number, cpu: CpuState) => [cpu.regA + val + (cpu.regFr & FR_C), cpu.regA];
        this.entry(0x69, 2).name("ADC")
            .immediate()
            .calc(adc as any, FR_Z | FR_C | FR_N | FR_V)
            .setA();
        this.entry(0x65, 3).name("ADC")
            .zeroPage()
            .load()
            .calc(adc as any, FR_Z | FR_C | FR_N | FR_V)
            .setA();
        this.entry(0x75, 4).name("ADC")
            .zeroPageX()
            .load()
            .calc(adc as any, FR_Z | FR_C | FR_N | FR_V)
            .setA();
        this.entry(0x6d, 4).name("ADC")
            .absolute()
            .load()
            .calc(adc as any, FR_Z | FR_C | FR_N | FR_V)
            .setA();
        this.entry(0x7d, 4).name("ADC")
            .absoluteX()
            .load()
            .calc(adc as any, FR_Z | FR_C | FR_N | FR_V)
            .setA();
        this.entry(0x79, 4).name("ADC")
            .absoluteY()
            .load()
            .calc(adc as any, FR_Z | FR_C | FR_N | FR_V)
            .setA();
        this.entry(0x61, 6).name("ADC")
            .indirectX()
            .load()
            .calc(adc as any, FR_Z | FR_C | FR_N | FR_V)
            .setA();
        this.entry(0x71, 5).name("ADC")
            .indirectY()
            .load()
            .calc(adc as any, FR_Z | FR_C | FR_N | FR_V)
            .setA();

        // SBC
        let sbc = (val: number, cpu: CpuState) => [0x100 + cpu.regA - val - ((cpu.regFr & FR_C) ^ FR_C), cpu.regA];
        this.entry(0xe9, 2).name("SBC")
            .immediate()
            .calc(sbc as any, FR_Z | FR_C | FR_N | FR_V)
            .setA();
        this.entry(0xe5, 3).name("SBC")
            .zeroPage()
            .load()
            .calc(sbc as any, FR_Z | FR_C | FR_N | FR_V)
            .setA();
        this.entry(0xf5, 4).name("SBC")
            .zeroPageX()
            .load()
            .calc(sbc as any, FR_Z | FR_C | FR_N | FR_V)
            .setA();
        this.entry(0xed, 4).name("SBC")
            .absolute()
            .load()
            .calc(sbc as any, FR_Z | FR_C | FR_N | FR_V)
            .setA();
        this.entry(0xfd, 4).name("SBC")
            .absoluteX()
            .load()
            .calc(sbc as any, FR_Z | FR_C | FR_N | FR_V)
            .setA();
        this.entry(0xf9, 4).name("SBC")
            .absoluteY()
            .load()
            .calc(sbc as any, FR_Z | FR_C | FR_N | FR_V)
            .setA();
        this.entry(0xe1, 6).name("SBC")
            .indirectX()
            .load()
            .calc(sbc as any, FR_Z | FR_C | FR_N | FR_V)
            .setA();
        this.entry(0xf1, 5).name("SBC")
            .indirectY()
            .load()
            .calc(sbc as any, FR_Z | FR_C | FR_N | FR_V)
            .setA();

        // AND
        let and = (val: number, cpu: CpuState) => cpu.regA &= val;
        this.entry(0x29, 2).name("AND")
            .immediate()
            .calc(and);
        this.entry(0x25, 3).name("AND")
            .zeroPage()
            .load()
            .calc(and);
        this.entry(0x35, 4).name("AND")
            .zeroPageX()
            .load()
            .calc(and);
        this.entry(0x2d, 4).name("AND")
            .absolute()
            .load()
            .calc(and);
        this.entry(0x3d, 4).name("AND")
            .absoluteX()
            .load()
            .calc(and);
        this.entry(0x39, 4).name("AND")
            .absoluteY()
            .load()
            .calc(and);
        this.entry(0x21, 6).name("AND")
            .indirectX()
            .load()
            .calc(and);
        this.entry(0x31, 5).name("AND")
            .indirectY()
            .load()
            .calc(and);

        // ORA
        let ora = (val: number, cpu: CpuState) => cpu.regA |= val;
        this.entry(0x09, 2).name("ORA")
            .immediate()
            .calc(ora);
        this.entry(0x05, 3).name("ORA")
            .zeroPage()
            .load()
            .calc(ora);
        this.entry(0x15, 4).name("ORA")
            .zeroPageX()
            .load()
            .calc(ora);
        this.entry(0x0d, 4).name("ORA")
            .absolute()
            .load()
            .calc(ora);
        this.entry(0x1d, 4).name("ORA")
            .absoluteX()
            .load()
            .calc(ora);
        this.entry(0x19, 4).name("ORA")
            .absoluteY()
            .load()
            .calc(ora);
        this.entry(0x01, 6).name("ORA")
            .indirectX()
            .load()
            .calc(ora);
        this.entry(0x11, 5).name("ORA")
            .indirectY()
            .load()
            .calc(ora);

        // EOR
        let eor = (val: number, cpu: CpuState) => cpu.regA ^= val;
        this.entry(0x49, 2).name("EOR")
            .immediate()
            .calc(eor);
        this.entry(0x45, 3).name("EOR")
            .zeroPage()
            .load()
            .calc(eor);
        this.entry(0x55, 4).name("EOR")
            .zeroPageX()
            .load()
            .calc(eor);
        this.entry(0x4d, 4).name("EOR")
            .absolute()
            .load()
            .calc(eor);
        this.entry(0x5d, 4).name("EOR")
            .absoluteX()
            .load()
            .calc(eor);
        this.entry(0x59, 4).name("EOR")
            .absoluteY()
            .load()
            .calc(eor);
        this.entry(0x41, 6).name("EOR")
            .indirectX()
            .load()
            .calc(eor);
        this.entry(0x51, 5).name("EOR")
            .indirectY()
            .load()
            .calc(eor);

        // ASL
        let asl = (val: number) => {
            //console.log("ASL:" + val);
            return [val << 1, (val & 0x80) > 0];
        };
        this.entry(0x0a, 2).name("ASL")
            .ope((val, cpu) => cpu.regA)
            .calc(asl as any, FR_C | FR_N | FR_Z)
            .setA();
        this.entry(0x06, 5).name("ASL")
            .zeroPage()
            .load()
            .calc(asl as any, FR_C | FR_N | FR_Z)
            .store();
        this.entry(0x16, 6).name("ASL")
            .zeroPageX()
            .load()
            .calc(asl as any, FR_C | FR_N | FR_Z)
            .store();
        this.entry(0x0e, 6).name("ASL")
            .absolute()
            .load()
            .calc(asl as any, FR_C | FR_N | FR_Z)
            .store();
        this.entry(0x1e, 6).name("ASL")
            .absoluteX()
            .load()
            .calc(asl as any, FR_C | FR_N | FR_Z)
            .store();

        // LSR
        let lsr = (val: number) => [val >> 1, (val & 0x01) > 0];
        this.entry(0x4a, 2).name("LSR")
            .ope((val, cpu) => cpu.regA)
            .calc(lsr as any, FR_C | FR_N | FR_Z)
            .setA();
        this.entry(0x46, 5).name("LSR")
            .zeroPage()
            .load()
            .calc(lsr as any, FR_C | FR_N | FR_Z)
            .store();
        this.entry(0x56, 6).name("LSR")
            .zeroPageX()
            .load()
            .calc(lsr as any, FR_C | FR_N | FR_Z)
            .store();
        this.entry(0x4e, 6).name("LSR")
            .absolute()
            .load()
            .calc(lsr as any, FR_C | FR_N | FR_Z)
            .store();
        this.entry(0x5e, 6).name("LSR")
            .absoluteX()
            .load()
            .calc(lsr as any, FR_C | FR_N | FR_Z)
            .store();

        // ROL
        let rol = (val: number, cpu: CpuState) => [(val << 1) | (cpu.regFr & FR_C), (val & 0x80) > 0];
        this.entry(0x2a, 2).name("ROL")
            .ope((val, cpu) => cpu.regA)
            .calc(rol as any, FR_C | FR_N | FR_Z)
            .setA();
        this.entry(0x26, 5).name("ROL")
            .zeroPage()
            .load()
            .calc(rol as any, FR_C | FR_N | FR_Z)
            .store();
        this.entry(0x36, 6).name("ROL")
            .zeroPageX()
            .load()
            .calc(rol as any, FR_C | FR_N | FR_Z)
            .store();
        this.entry(0x2e, 6).name("ROL")
            .absolute()
            .load()
            .calc(rol as any, FR_C | FR_N | FR_Z)
            .store();
        this.entry(0x3e, 6).name("ROL")
            .absoluteX()
            .load()
            .calc(rol as any, FR_C | FR_N | FR_Z)
            .store();


        // ROR
        let ror = (val: number, cpu: CpuState) => [(val >> 1) | ((cpu.regFr & FR_C) << 7), (val & 0x01) > 0];
        this.entry(0x6a, 2).name("ROR")
            .ope((val, cpu) => cpu.regA)
            .calc(ror as any, FR_C | FR_N | FR_Z)
            .setA();
        this.entry(0x66, 5).name("ROR")
            .zeroPage()
            .load()
            .calc(ror as any, FR_C | FR_N | FR_Z)
            .store();
        this.entry(0x76, 6).name("ROR")
            .zeroPageX()
            .load()
            .calc(ror as any, FR_C | FR_N | FR_Z)
            .store();
        this.entry(0x6e, 6).name("ROR")
            .absolute()
            .load()
            .calc(ror as any, FR_C | FR_N | FR_Z)
            .store();
        this.entry(0x7e, 6).name("ROR")
            .absoluteX()
            .load()
            .calc(ror as any, FR_C | FR_N | FR_Z)
            .store();

        // Relative Jump
        // BCC
        this.entry(0x90, 2).name("BCC")
            .relative(fr => (fr & FR_C) == 0);
        // BCS
        this.entry(0xb0, 2).name("BCS")
            .relative(fr => (fr & FR_C) > 0);
        // BEQ
        this.entry(0xf0, 2).name("BEQ")
            .relative(fr => (fr & FR_Z) > 0);
        // BNE
        this.entry(0xd0, 2).name("BNE")
            .relative(fr => (fr & FR_Z) == 0);
        // BVC
        this.entry(0x50, 2).name("BVC")
            .relative(fr => (fr & FR_V) == 0);
        // BVS
        this.entry(0x70, 2).name("BVS")
            .relative(fr => (fr & FR_V) > 0);
        // BPL
        this.entry(0x10, 2).name("BPL")
            .relative(fr => (fr & FR_N) == 0);
        // BMI
        this.entry(0x30, 2).name("BMI")
            .relative(fr => (fr & FR_N) > 0);

        // BIT
        // N 対象の bit7, V:対象の bit6,Z: A&対象==0
        this.entry(0x24, 3).name("BIT")
            .zeroPage()
            .load()
            .calc(val => [val, val ^ ((val & 0x40) << 1)], FR_N | FR_V)
            .calc((val, cpu) => val & cpu.regA, FR_Z);
        this.entry(0x2c, 4).name("BIT")
            .absolute()
            .load()
            .calc(val => [val, val ^ ((val & 0x40) << 1)], FR_N | FR_V)
            .calc((val, cpu) => val & cpu.regA, FR_Z);

        // JMP
        this.entry(0x4c, 3).name("JMP")
            .absolute()
            .jump();
        this.entry(0x6c, 5).name("JMP")
            .absoluteIndirect()
            .jump();

        // JSR
        this.entry(0x20, 6).name("JSR").absolute().jsr();
        // RTS
        this.entry(0x60, 6).name("RTS").rts();
        // BRK
        this.entry(0x00, 7).name("BRK").brk();
        // RTI
        this.entry(0x40, 6).name("RTI").rti();

        // CMP
        let cmpA = (val: number, cpu: CpuState) => [cpu.regA - val, cpu.regA >= val];
        let cmpX = (val: number, cpu: CpuState) => [cpu.regX - val, cpu.regX >= val];
        let cmpY = (val: number, cpu: CpuState) => [cpu.regY - val, cpu.regY >= val];
        this.entry(0xc9, 2).name("CMP")
            .immediate()
            .calc(cmpA as any, FR_Z | FR_N | FR_C);
        this.entry(0xc5, 3).name("CMP")
            .zeroPage()
            .load()
            .calc(cmpA as any, FR_Z | FR_N | FR_C);
        this.entry(0xd5, 4).name("CMP")
            .zeroPageX()
            .load()
            .calc(cmpA as any, FR_Z | FR_N | FR_C);
        this.entry(0xcd, 4).name("CMP")
            .absolute()
            .load()
            .calc(cmpA as any, FR_Z | FR_N | FR_C);
        this.entry(0xdd, 4).name("CMP")
            .absoluteX()
            .load()
            .calc(cmpA as any, FR_Z | FR_N | FR_C);
        this.entry(0xd9, 4).name("CMP")
            .absoluteY()
            .load()
            .calc(cmpA as any, FR_Z | FR_N | FR_C);
        this.entry(0xc1, 6).name("CMP")
            .indirectX()
            .load()
            .calc(cmpA as any, FR_Z | FR_N | FR_C);
        this.entry(0xd1, 5).name("CMP")
            .indirectY()
            .load()
            .calc(cmpA as any, FR_Z | FR_N | FR_C);
        // CPX
        this.entry(0xe0, 2).name("CPX")
            .immediate()
            .calc(cmpX as any, FR_Z | FR_N | FR_C);
        this.entry(0xe4, 3).name("CPX")
            .zeroPage()
            .load()
            .calc(cmpX as any, FR_Z | FR_N | FR_C);
        this.entry(0xec, 4).name("CPX")
            .absolute()
            .load()
            .calc(cmpX as any, FR_Z | FR_N | FR_C);
        // CPY
        this.entry(0xc0, 2).name("CPY")
            .immediate()
            .calc(cmpY as any, FR_Z | FR_N | FR_C);
        this.entry(0xc4, 3).name("CPY")
            .zeroPage()
            .load()
            .calc(cmpY as any, FR_Z | FR_N | FR_C);
        this.entry(0xcc, 4).name("CPY")
            .absolute()
            .load()
            .calc(cmpY as any, FR_Z | FR_N | FR_C);

        // INC
        this.entry(0xe6, 5).name("INC")
            .zeroPage()
            .load()
            .calc(val => val + 1)
            .store();
        this.entry(0xf6, 6).name("INC")
            .zeroPageX()
            .load()
            .calc(val => val + 1)
            .store();
        this.entry(0xee, 6).name("INC")
            .absolute()
            .load()
            .calc(val => val + 1)
            .store();
        this.entry(0xfe, 6).name("INC")
            .absoluteX()
            .load()
            .calc(val => val + 1)
            .store();

        // DEC
        this.entry(0xc6, 5).name("DEC")
            .zeroPage()
            .load()
            .calc(val => val - 1)
            .store();
        this.entry(0xd6, 6).name("DEC")
            .zeroPageX()
            .load()
            .calc(val => val - 1)
            .store();
        this.entry(0xce, 6).name("DEC")
            .absolute()
            .load()
            .calc(val => val - 1)
            .store();
        this.entry(0xde, 6).name("DEC")
            .absoluteX()
            .load()
            .calc(val => val - 1)
            .store();

        // INX
        this.entry(0xe8, 2).name("INX").ope((val, cpu) => cpu.regX + 1).setX();
        // DEX
        this.entry(0xca, 2).name("DEX").ope((val, cpu) => cpu.regX - 1).setX();
        // INY
        this.entry(0xc8, 2).name("INY").ope((val, cpu) => cpu.regY + 1).setY();
        // DEY
        this.entry(0x88, 2).name("DEY").ope((val, cpu) => cpu.regY - 1).setY();

        // CLC
        this.entry(0x18, 2).name("CLC").setFlag(fr => fr & ~FR_C);
        // SEC
        this.entry(0x38, 2).name("SEC").setFlag(fr => fr | FR_C);
        // CLI
        this.entry(0x58, 2).name("CLI").setFlag(fr => fr & ~FR_I);
        // SEI
        this.entry(0x78, 2).name("SEI").setFlag(fr => fr | FR_I);
        // CLD
        this.entry(0xd8, 2).name("CLD").setFlag(fr => fr & ~FR_D);
        // SED
        this.entry(0xf8, 2).name("SED").setFlag(fr => fr | FR_D);
        // CLV
        this.entry(0xb8, 2).name("CLV").setFlag(fr => fr & ~FR_V);

        // LDA
        this.entry(0xa9, 2).name("LDA").immediate().setA(true);
        this.entry(0xa5, 3).name("LDA").zeroPage().load().setA(true);
        this.entry(0xb5, 4).name("LDA").zeroPageX().load().setA(true);
        this.entry(0xad, 4).name("LDA").absolute().load().setA(true);
        this.entry(0xbd, 4).name("LDA").absoluteX().load().setA(true);
        this.entry(0xb9, 4).name("LDA").absoluteY().load().setA(true);
        this.entry(0xa1, 6).name("LDA").indirectX().load().setA(true);
        this.entry(0xb1, 5).name("LDA").indirectY().load().setA(true);
        // LDX
        this.entry(0xa2, 2).name("LDX").immediate().setX();
        this.entry(0xa6, 3).name("LDX").zeroPage().load().setX();
        this.entry(0xb6, 3).name("LDX").zeroPageY().load().setX();
        this.entry(0xae, 3).name("LDX").absolute().load().setX();
        this.entry(0xbe, 3).name("LDX").absoluteY().load().setX();
        // LDY
        this.entry(0xa0, 2).name("LDY").immediate().setY();
        this.entry(0xa4, 3).name("LDY").zeroPage().load().setY();
        this.entry(0xb4, 3).name("LDY").zeroPageX().load().setY();
        this.entry(0xac, 3).name("LDY").absolute().load().setY();
        this.entry(0xbc, 3).name("LDY").absoluteX().load().setY();

        // STA
        this.entry(0x85, 3).name("STA").zeroPage().store(cpu => cpu.regA);
        this.entry(0x95, 4).name("STA").zeroPageX().store(cpu => cpu.regA);
        this.entry(0x8d, 4).name("STA").absolute().store(cpu => cpu.regA);
        this.entry(0x9d, 4).name("STA").absoluteX().store(cpu => cpu.regA);
        this.entry(0x99, 4).name("STA").absoluteY().store(cpu => cpu.regA);
        this.entry(0x81, 6).name("STA").indirectX().store(cpu => cpu.regA);
        this.entry(0x91, 5).name("STA").indirectY().store(cpu => cpu.regA);
        // STX
        this.entry(0x86, 3).name("STX").zeroPage().store(cpu => cpu.regX);
        this.entry(0x96, 4).name("STX").zeroPageY().store(cpu => cpu.regX);
        this.entry(0x8e, 4).name("STX").absolute().store(cpu => cpu.regX);
        // STY
        this.entry(0x84, 3).name("STY").zeroPage().store(cpu => cpu.regY);
        this.entry(0x94, 4).name("STY").zeroPageX().store(cpu => cpu.regY);
        this.entry(0x8c, 4).name("STY").absolute().store(cpu => cpu.regY);

        // TAX
        this.entry(0xaa, 2).name("TAX").calc((val, cpu) => cpu.regX = cpu.regA);
        // TXA
        this.entry(0x8a, 2).name("TXA").calc((val, cpu) => cpu.regA = cpu.regX);
        // TAY
        this.entry(0xa8, 2).name("TAY").calc((val, cpu) => cpu.regY = cpu.regA);
        // TYA
        this.entry(0x98, 2).name("TYA").calc((val, cpu) => cpu.regA = cpu.regY);
        // TXS
        this.entry(0x9a, 2).name("TXS").setFlag((val, cpu) => cpu.regX);
        // TSX
        this.entry(0xba, 2).name("TSX").calc((val, cpu) => cpu.regX = cpu.regFr);

        // PHA
        this.entry(0x48, 3).name("PHA").pushA();
        // PLA
        this.entry(0x68, 4).name("PLA").popA();
        // PHP
        this.entry(0x08, 3).name("PHP").pushP();
        // PLP
        this.entry(0x28, 4).name("PLP").popP();

        // NOP
        this.entry(0xea, 2).name("NOP");
    }

    private debugCode: string[][] = [];
    private debugLog: boolean;
    private errorFlag = false;

    public execute(line: number): void {
        const scanClock = 114;
        if (line == 241) {
            // VBlank
            if (this.memory.isNmiEnabled) {
                this.cpuState.setInterrupt("nmi");
                //this.cycle += this.interrupt("nmi");
                //this.debugLog = true;
            }
        }
        while (this.cycle < scanClock) {
            if (this.cpuState.interrupted) {
                let type = this.cpuState.interrupted;
                this.cycle += this.interrupt(type);
                this.cpuState.setInterrupt("");
            }
            // TODO
            if (this.cpuState.regPc == 0x8ecd) {
                this.debugLog = true;
            }
            let code = this.memory.read(this.cpuState.regPc);
            let dbg = [("000" + Number(this.cpuState.regPc).toString(16)).substr(-4), toHex(code)];
            this.debugCode.push(dbg);
            if (this.debugCode.length > 10) {
                this.debugCode.splice(0, 1);
            }
            if (!this.errorFlag && this.cpuState.regPc < 0x8000) {
                this.errorFlag = true;
                console.log(this.debugCode);
                console.log(this.cpuState);
                for (let i = 0x1f0; i < 0x200; i++) {
                    console.log(Number(i).toString(16) + ":" + Number(this.memory.read(i)).toString(16));
                }
            }
            let ope = this.opeMap[code];
            if (ope) {
                dbg[1] = ope.toString(this.cpuState);
                this.cycle += ope.exec();
            } else {
                console.log("No Code:" + Number(code).toString(16));
                console.log(this.debugCode);
                this.cpuState.regPc = (this.cpuState.regPc + 1) & 0xffff;
                this.cycle += 20;
            }
            if (this.debugLog && "8057" != dbg[0]) {
                console.log(dbg);
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
        this.push(this.cpuState.regPc >> 8);
        this.push(this.cpuState.regPc & 0xff);
        this.push(this.cpuState.regFr);
        this.cpuState.regPc = nextPc;
        this.cpuState.regFr |= FR_I;
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