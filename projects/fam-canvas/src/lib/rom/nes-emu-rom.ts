import FamUtil, { NesRomData, FamMemory, FamCpu } from "../../worker/fam-util";
import { IFamROM, FamData, IFamPPU, FamStorageCheck } from "../../worker/fam-api";

/**
 * NES-ROMを返す
 * @param util 
 */
export var NesEmuRom = function (util: FamUtil) {
    class Mapper0 extends util.NesRomManager {
        constructor(rom: NesRomData) {
            super(rom);
        }

        init(memory: FamMemory): void {
            super.init(memory);
            memory.setPrgMemory(0x8000, this.nesRom.getPrg(0));
            memory.setPrgMemory(0xc000, this.nesRom.getPrg(this.nesRom.prgSize - 1));
        }
        write(memory: FamMemory, addr: number, val: number): void {
        }
    }
    class Mapper1 extends util.NesRomManager {
        private count: number;
        private data: number;
        private chr4k: boolean;
        private prgLow: boolean;
        private prg16k: boolean;
        private prgLowPage: number;
        private prgHighPage: number;
        private swapBase: number;
        private size512: boolean;

        constructor(rom: NesRomData) {
            super(rom);
        }

        private selectPage(memory: FamMemory, target: number, romIx: number): Mapper1 {
            // 0x4000
            //console.log(Number(target * 0x4000 + 0x8000).toString(16) + "...index=" + romIx);
            let data = this.nesRom.getPrg(romIx);
            memory.setPrgMemory(0x8000 + (target * 0x4000), data);
            return this;
        }

        private setPrg(memory: FamMemory, low: number, high: number, swap: number): void {
            //console.log("16k=" + this.prg16k + ", area=" + this.prgLow);
            //console.log("MAP:" + low + ", " + high + ", swap=" + swap);
            if (low != this.prgLowPage || swap != this.swapBase) {
                this.prgLowPage = low;
                this.selectPage(memory, 0, (swap | low));
            }
            if (high != this.prgHighPage || swap != this.swapBase) {
                this.prgHighPage = high;
                this.selectPage(memory, 1, (swap | high));
            }
            this.swapBase = swap;
        }

        init(memory: FamMemory): void {
            super.init(memory);

            this.count = 0;
            this.data = 0;
            this.prgLowPage = this.prgHighPage = -1;
            this.prgLow = this.prg16k = true;
            this.chr4k = false;
            this.setPrg(memory, 0, (this.nesRom.prgSize - 1) & 0x0f, 0);
            this.size512 = this.nesRom.prgSize > 16;

            //memory.setPrgMemory(0x8000, this.nesRom.getPrg(0));
            //memory.setPrgMemory(0xc000, this.nesRom.getPrg(this.nesRom.prgSize - 1));
        }
        write(memory: FamMemory, addr: number, val: number): void {
            //console.log("WRITE:" + Number(addr).toString(16) + " <= " + val);
            if ((val & 0x80) > 0) {
                this.count = this.data = 0;
                return;
            }
            this.data |= ((val & 1) << this.count);
            this.count++;
            if (this.count < 5) {
                return;
            }
            let reg = this.data;
            this.data = 0;
            this.count = 0;
            if (addr < 0xa000) {
                // 設定
                this.chr4k = (reg & 0x10) > 0;
                this.prgLow = (reg & 4) > 0;
                this.prg16k = (reg & 8) > 0;
                switch (reg & 3) {
                    case 0: // one-screen low bank
                        memory.famData.ppu.setMirrorMode("one0");
                        break;
                    case 1: // one-screen upper bank
                        memory.famData.ppu.setMirrorMode("one3");
                        break;
                    case 2: // vertical
                        memory.famData.ppu.setMirrorMode("vertical");
                        break;
                    case 3: // horizontal
                        memory.famData.ppu.setMirrorMode("horizontal");
                        break;
                }
            } else if (addr < 0xc000) {
                if (this.size512) {
                    this.setPrg(memory, this.prgLowPage, this.prgHighPage, reg & 0x10);
                }
                // chr low
                let page = reg & 0xf;
                if ((reg & 0x10) > 0) {
                    page += this.nesRom.chrSize;
                }
                if (this.chr4k) {
                    // 4k(CHR=8k=0x2000)
                    let chr = this.nesRom.getChr(page >> 1);
                    let ix = (page & 1) * 0x1000;
                    memory.famData.ppu.write(0, chr.slice(ix, ix + 0x1000));
                } else {
                    // 8k
                    memory.famData.ppu.write(0, this.nesRom.getChr(page >> 1));
                }
            } else if (addr < 0xe000) {
                // chr high
                let page = reg & 0xf;
                if ((reg & 0x10) > 0) {
                    page += this.nesRom.chrSize;
                }
                if (this.chr4k) {
                    let chr = this.nesRom.getChr(page >> 1);
                    let ix = (page & 1) * 0x1000;
                    memory.famData.ppu.write(0x1000, chr.slice(ix, ix + 0x1000));
                }
            } else {
                // prg
                if (this.prg16k) {
                    // 16k
                    if (this.prgLow) {
                        this.setPrg(memory, reg & 0xf, (this.nesRom.prgSize - 1) & 0xf, this.swapBase);
                    } else {
                        this.setPrg(memory, 0, reg & 0xf, this.swapBase);
                    }
                } else {
                    // 32k
                    this.setPrg(memory, reg & 0xe, (reg & 0xe) | 1, this.swapBase);
                }
            }
        }
    }
    class Mapper2 extends util.NesRomManager {
        constructor(rom: NesRomData) {
            super(rom);
        }

        init(memory: FamMemory): void {
            super.init(memory);
            memory.setPrgMemory(0x8000, this.nesRom.getPrg(0));
            memory.setPrgMemory(0xc000, this.nesRom.getPrg(this.nesRom.prgSize - 1));
        }
        write(memory: FamMemory, addr: number, val: number): void {
            memory.setPrgMemory(0x8000, this.nesRom.getPrg(val));
        }
    }

    class Mapper3 extends util.NesRomManager {
        // CN-ROM
        constructor(rom: NesRomData) {
            super(rom);
        }

        init(memory: FamMemory): void {
            super.init(memory);
            memory.setPrgMemory(0x8000, this.nesRom.getPrg(0));
            memory.setPrgMemory(0xc000, this.nesRom.getPrg(this.nesRom.prgSize - 1));
        }
        write(memory: FamMemory, addr: number, val: number): void {
            //console.log("WRITE:" + val);
            memory.famData.ppu.write(0, this.nesRom.getChr(val & 3));
        }
    }

    class Mapper25 extends util.NesRomManager {
        private swapMode = false;
        private prgMask: number;
        private chrMask: number;
        private prgBank0: number = 0;
        private prgBank1: number = 1;
        private chrBank: number[] = [0, 1, 2, 3, 4, 5, 6, 7];
        private lastChrBank: number[] = [0, 1, 2, 3, 4, 5, 6, 7];
        private prgList: Uint8Array[] = [];
        private chrList: Uint8Array[] = [];

        constructor(rom: NesRomData) {
            super(rom);
            this.prgMask = rom.prgSize > 8 ? 31 : 15;
            this.chrMask = rom.chrSize > 16 ? 0xff : 0x7f;
            for (let i = 0; i < rom.prgSize; i++) {
                let dt = rom.getPrg(i);
                this.prgList.push(dt.slice(0, 0x2000));
                this.prgList.push(dt.slice(0x2000));
            }
            for (let i = 0; i < rom.chrSize; i++) {
                let dt = rom.getChr(i);
                for (let j = 0; j < 8; j++) {
                    this.chrList.push(dt.slice(j * 0x400, (j + 1) * 0x400));
                }
            }
            // PRG=8129, CHR=1024
        }

        private fixPrgBank(memory: FamMemory): void {
            // 4000 -> 2000 に分割
            let last = this.prgList[this.prgList.length - 2];
            let prg0 = this.prgList[this.prgBank0];
            let prg1 = this.prgList[this.prgBank1];
            if (this.swapMode) {
                memory.setPrgMemory(0x8000, last);
                memory.setPrgMemory(0xc000, prg0);
            } else {
                memory.setPrgMemory(0xc000, last);
                memory.setPrgMemory(0x8000, prg0);
            }
            memory.setPrgMemory(0xa000, prg1);
        }
        private fixChrBank(memory: FamMemory, idx: number): void {
            if (this.lastChrBank[idx] != this.chrBank[idx]) {
                //console.log("CHR[" + idx + "]=" + this.chrBank[idx]);
                memory.famData.ppu.write(idx * 0x400, this.chrList[this.chrBank[idx] & this.chrMask]);
                this.lastChrBank[idx] = this.chrBank[idx];
            }
        }
        private setSwapMode(memory: FamMemory, mode: boolean): void {
            this.swapMode = mode;
            this.fixPrgBank(memory);
        }
        private setPrgBank0(memory: FamMemory, val: number): void {
            this.prgBank0 = val & this.prgMask;
            this.fixPrgBank(memory);
        }
        private setPrgBank1(memory: FamMemory, val: number): void {
            this.prgBank1 = val & this.prgMask;
            this.fixPrgBank(memory);
        }
        private setChrBankLow(memory: FamMemory, idx: number, val: number): void {
            this.chrBank[idx] = (this.chrBank[idx] & 0x1f0) | (val & 0xf);
            this.fixChrBank(memory, idx);
        }
        private setChrBankHigh(memory: FamMemory, idx: number, val: number): void {
            this.chrBank[idx] = (this.chrBank[idx] & 0x0f) | ((val & 0x1f) << 4);
            this.fixChrBank(memory, idx);
            //console.log("Chr-High[" + idx + "]=" + val);
        }
        private setMirroring(memory: FamMemory, val: number): void {
            switch (val & 3) {
                case 0:
                    memory.famData.ppu.setMirrorMode("vertical");
                    break;
                case 1:
                    memory.famData.ppu.setMirrorMode("horizontal");
                    break;
                case 2:
                    memory.famData.ppu.setMirrorMode("one0");
                    break;
                case 3:
                    memory.famData.ppu.setMirrorMode("one3");
                    break;
            }
        }

        init(memory: FamMemory): void {
            super.init(memory);
            memory.setPrgMemory(0xe000, this.prgList[this.prgList.length - 1]);
            this.fixPrgBank(memory);
        }
        write(memory: FamMemory, addr: number, val: number): void {
            //console.log("WRITE:" + val);
            switch (addr & 0xf00f) {
                case 0x8000:
                case 0x8002:
                case 0x8008:
                case 0x8001:
                case 0x8004:
                case 0x8003:
                case 0x800C:
                    this.setPrgBank0(memory, val);
                    break;
                case 0x9000:
                case 0x9002:
                case 0x9008:
                    this.setMirroring(memory, val);
                    break;
                case 0x9001:
                case 0x9004:
                case 0x9003:
                case 0x900C:
                    this.setSwapMode(memory, (val & 2) == 2);
                    break;
                case 0xA000:
                case 0xA002:
                case 0xA008:
                case 0xA001:
                case 0xA004:
                case 0xA003:
                case 0xA00C:
                    this.setPrgBank1(memory, val);
                    break;
                case 0xB000:
                    this.setChrBankLow(memory, 0, val);
                    break;
                case 0xB002:
                case 0xB008:
                    this.setChrBankHigh(memory, 0, val);
                    break;
                case 0xB001:
                case 0xB004:
                    this.setChrBankLow(memory, 1, val);
                    break;
                case 0xB003:
                case 0xB00C:
                    this.setChrBankHigh(memory, 1, val);
                    break;
                case 0xC000:
                    this.setChrBankLow(memory, 2, val);
                    break;
                case 0xC002:
                case 0xC008:
                    this.setChrBankHigh(memory, 2, val);
                    break;
                case 0xC001:
                case 0xC004:
                    this.setChrBankLow(memory, 3, val);
                    break;
                case 0xC003:
                case 0xC00C:
                    this.setChrBankHigh(memory, 3, val);
                    break;
                case 0xD000:
                    this.setChrBankLow(memory, 4, val);
                    break;
                case 0xD002:
                case 0xD008:
                    this.setChrBankHigh(memory, 4, val);
                    break;
                case 0xD001:
                case 0xD004:
                    this.setChrBankLow(memory, 5, val);
                    break;
                case 0xD003:
                case 0xD00C:
                    this.setChrBankHigh(memory, 5, val);
                    break;
                case 0xE000:
                    this.setChrBankLow(memory, 6, val);
                    break;
                case 0xE002:
                case 0xE008:
                    this.setChrBankHigh(memory, 6, val);
                    break;
                case 0xE001:
                case 0xE004:
                    this.setChrBankLow(memory, 7, val);
                    break;
                case 0xE003:
                case 0xE00C:
                    this.setChrBankHigh(memory, 7, val);
                    break;
                case 0xF000:
                    //setIRQlow(val);
                    break;
                case 0xF002:
                case 0xF008:
                    //setIRQhigh(val);
                    break;
                case 0xF001:
                case 0xF004:
                    //setIRQmode(val);
                    break;
                case 0xF003:
                case 0xF00C:
                    //ackIRQ();
                    break;
            }
        }
    }

    class NesEmu implements IFamROM {
        private nesRom: NesRomData;
        private initFlag: boolean;
        private memory: FamMemory;
        private famCpu: FamCpu;
        private storageCheck: FamStorageCheck;

        private getMapper(rom: NesRomData): any {
            switch (rom.mapperType) {
                case 1:
                    return new Mapper1(rom);
                case 2:
                    return new Mapper2(rom);
                case 3:
                    return new Mapper3(rom);
                case 25:
                    return new Mapper25(rom);
            }
            return new Mapper0(rom);
        }
        preScanLine(data: FamData, line: number): void {
            if (!this.initFlag) {
                return;
            }
            this.famCpu.execute(line, false);
        }
        hBlank(data: FamData, line: number): void {
            if (!this.initFlag) {
                return;
            }
            this.famCpu.execute(line, true);
        }
        vBlank(data: FamData): void {
            if (!this.initFlag) {
                return;
            }
            this.memory.checkButton(data.button);
        }
        checkStorage(check: FamStorageCheck): void {
            this.storageCheck = check;
        }
        init(data: FamData, type: "power" | "reset", param?: any): void {
            if (!this.nesRom) {
                if (typeof param == "string") {
                    util.load(param).then(rom => {
                        this.nesRom = rom;
                        console.log(rom);
                        this.memory = util.getMemory(data, this.getMapper(rom));
                        this.famCpu = new util.FamCpu(this.memory);
                        this.backupCheck();
                    }, err => {
                        console.log(err);
                    });
                } else if (param instanceof Uint8Array) {
                    this.nesRom = new util.NesRomData(param);
                    console.log(this.nesRom);
                    this.memory = util.getMemory(data, this.getMapper(this.nesRom));
                    this.famCpu = new util.FamCpu(this.memory);
                    this.backupCheck();
                } else {
                    throw "Unknown Param Type";
                }
            } else {
                this.memory.reset();
                this.famCpu = new util.FamCpu(this.memory);
                this.backupCheck();
            }
        }
        private backupCheck(): void {
            if (this.nesRom.hasBattery) {
                // 6000-7fff
                this.storageCheck(this.nesRom.md5hash, 0x2000).then(res => {
                    let bak = util.getBackupMemory(res);
                    this.memory.setMemory(bak, 0x6000, 0x8000);
                    this.initFlag = true;
                    // VBlank Clear
                    this.memory.famData.ppu.readState();
                }, err => {
                    console.log(err);
                    console.log("Storage Error");
                });
                return;
            }
            this.initFlag = true;
            this.memory.famData.ppu.readState();
        }
    }
    return new NesEmu();
}