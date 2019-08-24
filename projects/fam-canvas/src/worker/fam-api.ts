import FamUtil from "./fam-util";

export interface PPUConfig2000 {
    // 0:8x8, 1:8x16
    spriteSize?: 0 | 1;
    // 0:0000, 1:0x1000
    bgPattern?: 0 | 1;
    // 0:0000, 1:0x1000
    spritePattern?: 0 | 1;
    /**
     * 0-3:
     *  0:2000  1:2400
     *  2:2800  3:2C00
     */
    nameTable?: number;
}

export interface PPUConfig2001 {
    // 0-7: rgb
    bgColor?: number;
    sprite?: boolean;
    bg?: boolean;
    // 0:描画しない, 1:描画
    spriteMask?: 0 | 1;
    // 0:描画しない, 1:描画
    bgMask?: 0 | 1;
}

export interface PPUState {
    vblank: boolean;
    spriteHit: boolean;
    // 0:８個以下, 1:９個以上
    scanSprite: 0 | 1;
}

/**
 * PPU
 */
export interface IFamPPU {
    write(addr: number, val: number): void;
    write(addr: number, val: number[]): void;
    write(addr: number, val: Uint8Array): void;

    read(addr: number): number;
    read(addr: number, size: number): Uint8Array;

    writeSprite(addr: number, val: number): void;
    writeSprite(addr: number, val: number[]): void;
    writeSprite(addr: number, val: Uint8Array): void;

    setConfig2000(config: PPUConfig2000): void;
    setConfig2001(config: PPUConfig2001): void;
    setScroll(sx: number, sy: number): void;
    readState(): PPUState;

    setMirrorMode(mode: "vertical" | "horizontal" | "four"): void;

    reset(): void;
}

/**
 * 矩形波
 */
export interface ISquareSound {
    setVolume(duty: number, halt: boolean, volume: number): ISquareSound;
    setEnvelope(duty: number, loop: boolean, period: number): ISquareSound;
    setTimer(lenIndex: number, timer: number): ISquareSound;
    // 下位8bitを設定する
    setTimerLow(low: number): ISquareSound;
    /**
     * Sweep設定
     * @param enableFlag 有効フラグ
     * @param period 周期[0-7]
     * @param mode 0:しり下がり,1:尻上がり
     * @param value スイープ量[0-7]
     */
    setSweep(enableFlag: boolean, period: number, mode: number, value: number): ISquareSound;

    setEnabled(flag: boolean): ISquareSound;
    isPlaing(): boolean;
}

/**
 * 三角波
 */
export interface ITriangleSound {

    setLinear(loop: boolean, lineCount: number): ITriangleSound;

    setTimer(lenIndex: number, timerCount: number): ITriangleSound;
    setTimerLow(low: number): ITriangleSound;

    setEnabled(flag: boolean): ITriangleSound;
    isPlaing(): boolean;
}

export interface INoiseSound {
    setVolume(stopFlag: boolean, volume: number): INoiseSound;

	/**
	 * エンベロープを設定する. ボリュームは無効となる.
	 * 
	 * @param loopFlag
	 *            ループして続けるかのフラグ
	 * @param period
	 *            周期:[0-15]
	 * @return
	 */
    setEnvelope(loopFlag: boolean, period: number): INoiseSound;

    setRandomMode(shortFlag: number, timerIndex: number): INoiseSound;

    setLength(lengthIndex: number): INoiseSound;

    setEnabled(flag: boolean): INoiseSound;
    isPlaing(): boolean;
}

export interface IDeltaSound {

    setPeriod(loopFlag: boolean, periodIndex: number): IDeltaSound;

    setDelta(delta: number): IDeltaSound;

    setSample(data: number[] | Uint8Array, start: number, length: number): IDeltaSound;

    setEnabled(flag: boolean): IDeltaSound;

    isPlaing(): boolean;
}

/**
 * APU
 */
export interface IFamAPU {
    // mode: 0=4Step, 1=5Step
    setMode(mode: number, irq?: (apu: IFamAPU) => void): IFamAPU;
    readonly square: [ISquareSound, ISquareSound];
    readonly triangle: ITriangleSound;
    readonly noise: INoiseSound;
    readonly delta: IDeltaSound;
}

/**
 * データ
 */
export interface FamData {
    ppu: IFamPPU;
    apu: IFamAPU;
    button: number[];
}

/**
 * 実装
 */
export interface IFamROM {
    hBlank?(data: FamData, line: number): void;
    vBlank?(data: FamData): void;
    init?(data: FamData, type: "power" | "reset", param?: any): void;
}

/**
 * Workerへ送ることができる閉じた関数
 */
export type FamFunction = (util?: FamUtil) => IFamROM;
