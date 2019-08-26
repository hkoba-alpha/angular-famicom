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
                if ((reg & 2) == 0) {
                    // one screen
                    memory.famData.ppu.setMirrorMode("horizontal");
                } else if ((reg & 1) > 0) {
                    // hor
                    memory.famData.ppu.setMirrorMode("horizontal");
                } else {
                    memory.famData.ppu.setMirrorMode("vertical");
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
                    // 4k
                    /*
                    for (let i = 0; i < 4; i++) {
                        chrMapper.selectPage(i, page * 4 + i);
                    }
                    */
                } else {
                    // 8k
                    /*
                    for (int i = 0; i < 8; i++) {
                        chrMapper.selectPage(i, page * 4 + i);
                    }
                    */
                }
            } else if (addr < 0xe000) {
                // chr high
                let page = reg & 0xf;
                /*
                if ((reg & 0x10) > 0) {
                    page += chrMapper.getBankSize();
                }
                if (chr4k) {
                    // 4k
                    for (int i = 0; i < 4; i++) {
                        chrMapper.selectPage(i + 4, page * 4 + i);
                    }
                }
                */
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
            }
            return new Mapper0(rom);
        }
        hBlank(data: FamData, line: number): void {
            if (!this.initFlag) {
                return;
            }
            this.famCpu.execute(line);
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