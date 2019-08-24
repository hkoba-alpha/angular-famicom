import FamUtil, { NesRomData, FamMemory, FamCpu } from "../../worker/fam-util";
import { IFamROM, FamData, IFamPPU } from "../../worker/fam-api";

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

        private getMapper(rom: NesRomData): any {
            if (rom.mapperType == 3) {
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
        init(data: FamData, type: "power" | "reset", param?: any): void {
            if (!this.nesRom) {
                util.load(param).then(rom => {
                    this.nesRom = rom;
                    console.log(rom);
                    this.memory = util.getMemory(data, this.getMapper(rom));
                    this.famCpu = new util.FamCpu(this.memory);
                    this.initFlag = true;
                }, err => {
                    console.log(err);
                });
            }
        }
    }
    return new NesEmu();
}