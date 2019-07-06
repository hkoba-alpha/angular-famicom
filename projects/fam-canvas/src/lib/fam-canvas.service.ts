import { Injectable, EventEmitter } from '@angular/core';
import { FamResponseMsg, FamRequestMsg, FamButton } from '../worker/fam-msg';
import { IFamROM, FamFunction } from '../worker/fam-api';
import { FamWorkerImpl } from '../worker/fam-impl';

export const famKeyConfig: { [key: string]: { pad: number, button: number } } = {
  "ArrowUp": {
    pad: 0,
    button: FamButton.Up
  },
  "ArrowLeft": {
    pad: 0,
    button: FamButton.Left
  },
  "ArrowRight": {
    pad: 0,
    button: FamButton.Right
  },
  "ArrowDown": {
    pad: 0,
    button: FamButton.Down
  },
  "Space": {
    pad: 0,
    button: FamButton.Select
  },
  "Enter": {
    pad: 0,
    button: FamButton.Start
  },
  "KeyX": {
    pad: 0,
    button: FamButton.A
  },
  "KeyZ": {
    pad: 0,
    button: FamButton.B
  }
};

/**
 * 仮想マシン
 */
export abstract class FamMachine {
  private eventData: EventEmitter<FamResponseMsg> = new EventEmitter();

  // 実行中フラグ
  private runFlag: boolean = false;

  // 画像付きフレーム処理が実行中かどうか
  private frameRunning: boolean = false;

  // ボタンフラグ
  private button: number[] = [0, 0];

  // APU関連
  private audioContext: any;
  private audioSrc: any;
  private audioData: any;

  constructor() {
    this.audioContext = new (window["webkitAudioContext"] || window["AudioContext"])();
    let buf = this.audioContext.createBuffer(1, 22050 / 4, 22050);
    this.audioData = buf.getChannelData(0);
    this.audioSrc = this.audioContext.createBufferSource();
    this.audioSrc.buffer = buf;
    this.audioSrc.loop = true;
    this.audioSrc.connect(this.audioContext.destination);
  }

  public start(): void {
    if (!this.runFlag) {
      let func = () => {
        if (this.runFlag) {
          this.requestFrame();
          requestAnimationFrame(func);
        }
      }
      this.runFlag = true;
      func();
      this.audioSrc.start();
    }
  }
  public stop(): void {
    this.audioSrc.stop();
    this.runFlag = false;
  }
  public reset(): void {
    this.request({ type: "reset", button: this.button });
  }
  public step(): void {
    if (!this.runFlag) {
      this.requestFrame();
    }
  }
  public shutdown(): void {
    this.stop();
    this.request({ type: "shutdown", button: this.button });
    this.eventData.complete();
  }

  protected requestFrame(): void {
    if (this.frameRunning) {
      this.request({ type: "skip-frame", button: this.button });
    } else {
      this.frameRunning = true;
      this.request({ type: "frame", button: this.button });
    }
  }

  // フレーム処理が終わったら、もらった応答を返す
  protected response(res: FamResponseMsg): void {
    if (res.screen) {
      this.frameRunning = false;
    }
    this.eventData.emit(res);
  }

  // リクエストを実装する
  protected abstract request(req: FamRequestMsg): void;

  public get event(): EventEmitter<FamResponseMsg> {
    return this.eventData;
  }

  public press(ix: number, btn: number): void {
    this.button[ix] |= btn;
  }
  public release(ix: number, btn: number): void {
    this.button[ix] &= ~btn;
  }
}

class WebMachine extends FamMachine {
  private worker: FamWorkerImpl;
  constructor(rom: any) {
    super();
    let famRom: IFamROM;
    if (typeof rom == "function") {
      famRom = rom();
    } else if (typeof rom == "object") {
      famRom = rom;
    }
    this.worker = new FamWorkerImpl(famRom);
  }

  protected request(req: FamRequestMsg): void {
    let res = this.worker.execute(req);
    super.response(res);
  }
}

class WorkerMachine extends FamMachine {
  private worker: Worker;

  constructor(rom: any) {
    super();
    this.worker = new Worker("assets/famicom.js");
    this.worker.onmessage = (res) => {
      super.response(res.data);
    };
    if (typeof rom == "function") {
      this.worker.postMessage({
        type: "function",
        button: [],
        option: rom.toString()
      } as FamRequestMsg);
    }
  }

  protected request(req: FamRequestMsg): void {
    this.worker.postMessage(req);
  }
}

@Injectable({
  providedIn: 'root'
})
export class FamCanvasService {

  constructor() { }

  public createMachine(rom: IFamROM): FamMachine;
  public createMachine(func: FamFunction, worker?: boolean): FamMachine;
  public createMachine(rom: any, worker: boolean = false): FamMachine {
    console.log(typeof rom);
    console.log(rom);
    if (worker) {
      return new WorkerMachine(rom);
    } else {
      return new WebMachine(rom);
    }
  }
}
