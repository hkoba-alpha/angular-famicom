export enum FamButton {
    A = 1,
    B = 2,
    Select = 4,
    Start = 8,
    Up = 16,
    Down = 32,
    Left = 64,
    Right = 128
}

/**
 * マシン制御メッセージ
 */
export interface FamRequestMsg {
    type: "frame" | "skip-frame" | "reset" | "script" | "function" | "shutdown" | "param" | "storage";
    button: number[];
    option?: any;
}

/**
 * １フレームの応答メッセージ
 */
export interface FamResponseMsg {
    screen?: Uint32Array;
    sound?: Uint8Array;
}

/**
 * ストレージ操作のメッセージ
 */
export interface FamStorageMsg {
    type: "load" | "save";
    key: string;
    data?: Uint8Array;  // for save
    size?: number;      // for load
}