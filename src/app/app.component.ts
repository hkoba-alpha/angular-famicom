import { Component, NgModuleFactoryLoader, OnInit } from '@angular/core';
import { Myrom } from './fam-rom/myrom';
import { FamCanvasService, FamMachine } from 'projects/fam-canvas/src/public_api';
import { IFamROM, BootRom, FamData } from 'projects/fam-canvas/src/worker/fam-api';
import { FamWorkerImpl } from 'projects/fam-canvas/src/worker/fam-impl';

let myCode = function () {
  class Base {
    private test = 3;
    public static type = "test";

    public myFunc() {
      console.log("Base");
      return 0;
    }
  }
  class MyObj extends Base {
    private obj = 4;
    private static instance = null;

    public myFunc() {
      console.log("Obj");
      return 3;
    }

    public myObjFunc() {
      console.log("test");
      new Base();
    }
  }
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
  title = 'famicom';
  famMachine: FamMachine;

  constructor(private loader: NgModuleFactoryLoader, private famService: FamCanvasService) {

  }

  ngOnInit(): void {
    console.log(myCode);
    this.famMachine = this.famService.createMachine(() => {
      //@BootRom
      let x = 0;
      let y = 0;
      class TestRom implements IFamROM {
        vBlank(fam: FamData) {
          fam.ppu.setScroll(x, y);
          x = (x + 1) & 255;
          y = (y + 1) % 240;
        }
      }
      return new TestRom();
    }, true);
  }

  onStart(): void {
    if (this.famMachine) {
      this.famMachine.start();
    }
  }
  onStop(): void {
    if (this.audioSrc) {
      this.audioSrc.stop();
    }
    if (this.famMachine) {
      this.famMachine.stop();
    }
  }

  private audioContext: any;
  private audioSrc: any;
  private audioBuf: any;

  onPlay() {
    if (!this.audioContext) {
      this.audioContext = new (window["webkitAudioContext"] || window["AudioContext"])();
      let ctx = this.audioContext;
      console.log(ctx.sampleRate);
      //ctx.sampleRate = 48000;
      let buf = ctx.createBuffer(1, 22050, 22050);
      let data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        if ((i % 100) < 50) {
          data[i] = 1;
        } else {
          data[i] = 0;
        }
      }
      let src = ctx.createBufferSource();
      console.log(Object.keys(src));
      src.buffer = buf;
      src.loop = false;
      src.connect(ctx.destination);
      src.start(0);
      this.audioBuf = data;
      this.audioSrc = src;
    } else {
      let ctx = this.audioContext;
      let buf = ctx.createBuffer(1, 22050, 22050);
      let data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        if ((i % 100) < 50) {
          data[i] = 1;
        } else {
          data[i] = 0;
        }
      }
      let src = ctx.createBufferSource();
      console.log(Object.keys(src));
      src.buffer = buf;
      src.loop = false;
      src.connect(ctx.destination);
      this.audioBuf = data;
      this.audioSrc = src;
      for (let i = 0; i < data.length; i++) {
        if ((i % 80) < 40) {
          data[i] = 1;
        } else {
          data[i] = 0;
        }
      }
      src.start(0);
    }
  }
}
