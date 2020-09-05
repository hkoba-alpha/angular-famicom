import { Injectable, EventEmitter } from '@angular/core';
import { FamResponseMsg, FamRequestMsg, FamButton } from '../worker/fam-msg';
import { IFamROM, FamFunction } from '../worker/fam-api';
import { FamWorkerImpl, FamStorageBase } from '../worker/fam-impl';
import FamUtil from '../worker/fam-util';
import { Observable, of } from 'rxjs';

var indexedDB: IDBFactory = window["indexedDB"] || window["mozIndexedDB"] || window["webkitIndexedDB"] || window["msIndexedDB"];

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
  private frameRunning: number = 0;

  // ボタンフラグ
  private button: number[] = [0, 0];

  private soundList: Uint8Array[] = [];
  private audioContext: AudioContext;
  // 1/60秒間のサンプル数
  private sampleRate: number;
  // 次に再生するインデックス
  private sampleIndex: number;

  // 音声がなかった時間
  private skipCount: number = 1;

  constructor() {
  }

  public setInitParam(param: any): void {
    this.request({
      type: "param",
      button: [],
      option: param
    });
  }

  public start(): void {
    this.soundOn();
    if (!this.runFlag) {
      let func = () => {
        if (this.runFlag) {
          this.requestFrame();
          requestAnimationFrame(func);
        }
      }
      this.runFlag = true;
      func();
    }
  }
  public stop(): void {
    this.runFlag = false;
    if (this.audioContext) {
      if (this.audioContext.state == "running") {
        this.audioContext.suspend().then();
      }
    }
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
      this.frameRunning++;
      if (this.frameRunning > 4) {
        //console.log("SKIP:" + this.frameRunning);
        return;
      }
      this.request({ type: "skip-frame", button: this.button });
    } else {
      this.frameRunning = 1;
      this.request({ type: "frame", button: this.button });
    }
  }

  // フレーム処理が終わったら、もらった応答を返す
  protected response(res: FamResponseMsg): void {
    if (res.screen) {
      this.frameRunning = 0;
    }
    if (res.sound) {
      this.soundList.push(res.sound);
      if (this.soundList.length > 10) {
        this.soundList.splice(0, 1);
      }
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

  public soundOn(): void {
    if (!this.audioContext) {
      this.audioContext = new (window["AudioContext"] || window["webkitAudioContext"])();
      console.log("SampleRate=" + this.audioContext.sampleRate);
      console.log("1/60=" + this.audioContext.sampleRate / 60);
      let node = this.audioContext.createScriptProcessor(1024, 1, 1);
      this.sampleRate = Math.floor(this.audioContext.sampleRate / 60);
      node.onaudioprocess = evt => this.onAudioProcess(evt);
      let src = this.audioContext.createBufferSource();
      //let src = this.audioContext.createOscillator();
      //src.connect(this.audioContext.destination);
      src.loop = true;
      src.connect(node);
      node.connect(this.audioContext.destination);
      src.start(0);
    } else {
      console.log("status=" + this.audioContext.state);
      if (this.audioContext.state == "suspended") {
        this.audioContext.resume().then();
      }
    }
  }

  private onAudioProcess(evt: AudioProcessingEvent): void {
    let len = evt.outputBuffer.length;
    let buf = evt.outputBuffer.getChannelData(0);
    if (this.skipCount || this.soundList.length == 0) {
      if (this.skipCount % 20 == 1) {
        console.log("skip=" + this.skipCount);
      }
      if (this.soundList.length < 3) {
        this.skipCount++;
        for (let i = 0; i < len; i++) {
          buf[i] = 0;
        }
        return;
      }
      this.skipCount = 0;
      this.sampleIndex = 0;
    }
    let data = this.soundList[0];
    for (let i = 0; i < len; i++) {
      buf[i] = data[Math.floor(this.sampleIndex * data.length / this.sampleRate)] / 255.0;
      this.sampleIndex++;
      if (this.sampleIndex >= this.sampleRate) {
        this.sampleIndex = 0;
        this.soundList.splice(0, 1);
        if (this.soundList.length == 0) {
          if (i < len - 1) {
            this.skipCount = 1;
          }
          break;
        }
        data = this.soundList[0];
      }
    }
  }

  protected loadStorage(key: string, size: number): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      // TODO
      this.getStorage().subscribe(db => {
        let tx = db.transaction("backup", "readonly");
        let req = tx.objectStore("backup").get(key);
        req.onsuccess = (ev) => {
          let res = ev.target["result"];
          let data = new Uint8Array(size);
          if (res) {
            data.set(res.data);
          }
          resolve(data);
        };
        req.onerror = err => {
          console.log(err);
          console.log("Error");
          resolve(new Uint8Array(size));
        };
      }, err => {
        console.log(err);
        console.log("Error");
        resolve(new Uint8Array(size));
      });
    });
  }

  protected saveStorage(key: string, data: Uint8Array): void {
    this.getStorage().subscribe(db => {
      this.getStorage().subscribe(db => {
        let tx = db.transaction("backup", "readwrite");
        let req = tx.objectStore("backup").put({
          key: key,
          data: data
        });
        req.onsuccess = (ev) => {
        };
        req.onerror = err => {
          console.log(err);
          console.log("Save Error");
        };
      }, err => {
        console.log(err);
        console.log("Save Error");
      });
    }, err => {
      console.log(err);
      console.log("Save Error");
    });
  }

  private backupDB: IDBDatabase;

  private getStorage(): Observable<IDBDatabase> {
    if (this.backupDB) {
      return of(this.backupDB);
    }
    return Observable.create(observer => {
      let request = indexedDB.open("fam-canvas", 1);
      request.onupgradeneeded = (ev) => {
        let db = ev.target["result"];
        db.createObjectStore("backup", { keyPath: 'key' });
      };
      request.onsuccess = (ev) => {
        this.backupDB = ev.target["result"];
        observer.next(this.backupDB);
        observer.complete();
      };
      request.onerror = (ev) => {
        observer.reject(ev);
      };
    });
  }
}

class WebMachine extends FamMachine {
  private worker: FamWorkerImpl;
  constructor(rom: any) {
    super();
    let famRom: IFamROM;
    if (typeof rom == "function") {
      famRom = rom(new FamUtil());
    } else if (typeof rom == "object") {
      famRom = rom;
    }
    this.worker = new FamWorkerImpl(famRom, (key, size) => {
      return new Promise((resolve, reject) => {
        this.loadStorage(key, size).then(res => {
          let machine = this;
          let storage = new class extends FamStorageBase {
            constructor() {
              super(res);
            }
            flushData(data: Uint8Array): void {
              machine.saveStorage(key, data);
            }
          };
          resolve(storage);
        }, err => reject(err));
      });
    });
  }

  protected request(req: FamRequestMsg): void {
    let res = this.worker.execute(req);
    if (res) {
      super.response(res);
    }
  }
}

class WorkerMachine extends FamMachine {
  private worker: Worker;

  constructor(rom: any) {
    super();
    this.worker = new Worker("assets/famicom.js");
    this.worker.onmessage = (res) => {
      if (res.data.key) {
        // ストレージへ保存
        if (res.data.type == "load") {
          // load
          this.loadStorage(res.data.key, res.data.size).then(res => {
            this.request({
              type: "storage",
              button: [],
              option: res
            });
          }, err => {
          });
        } else if (res.data.type == "save") {
          // save
          this.saveStorage(res.data.key, res.data.data);
        }
        return;
      }
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
    let opt: any[] = undefined;
    if (req.option) {
      // 特別
      if (req.option instanceof Uint8Array) {
        opt = [req.option.buffer];
      }
    }
    this.worker.postMessage(req, opt);
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
