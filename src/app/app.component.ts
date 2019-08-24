import { Component, NgModuleFactoryLoader, OnInit } from '@angular/core';
import { Myrom } from './fam-rom/myrom';
import { FamCanvasService, FamMachine } from 'projects/fam-canvas/src/public_api';
import { IFamROM, FamData } from 'projects/fam-canvas/src/worker/fam-api';
import FamUtil from 'projects/fam-canvas/src/worker/fam-util';
import { NesEmuRom } from 'projects/fam-canvas/src/lib/rom/nes-emu-rom';

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
    /*
    this.famMachine = this.famService.createMachine((util: FamUtil) => {
      //import * as NesRomData from 'projects/fam-canvas/src/worker/fam-util';
      //require("projects/fam-canvas/src/worker/fam-util");
      //@BootRom
      let x = 0;
      let y = 0;
      class TestRom implements IFamROM {
        init(fam: FamData, type, param) {
          console.log(param);
          fam.ppu.setConfig2000({
            bgPattern: 0,
            spritePattern: 0
          });
          fam.ppu.setMirrorMode("horizontal");
          util.load("/assets/smario.nes").then(res => {
            console.log(res);
            if (res.chrSize > 0) {
              fam.ppu.write(0, res.getChr(0, res.chrSize));
            }
          }, err => {
            console.log(err);
          });
        }

        vBlank(fam: FamData) {
          fam.ppu.setScroll(x, y);
          x = (x + 1) & 255;
          y = (y + 1) % 240;
        }
      }
      return new TestRom();
    }, true);
    this.famMachine.setInitParam({ msg: "test param", data: [1,2,3]});
    */
    this.famMachine = this.famService.createMachine(NesEmuRom, true);
    //this.famMachine.setInitParam("/assets/smario.nes");
    this.famMachine.setInitParam("/assets/dq1.nes");
  }

  onStart(): void {
    if (this.famMachine) {
      this.famMachine.start();
    }
  }
  onStop(): void {
    if (this.famMachine) {
      this.famMachine.stop();
    }
  }
}
