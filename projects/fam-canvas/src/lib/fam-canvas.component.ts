import { Component, OnInit, Input, ViewChild, ElementRef, HostListener } from '@angular/core';
import { FamCanvasService, FamMachine, famKeyConfig } from './fam-canvas.service';
import { FamResponseMsg } from '../worker/fam-msg';

// APUの1/60のデータ数
const SAMPLE_RATE = 200;

@Component({
  selector: 'fam-canvas',
  template: `
    <canvas #ppuCanvas tabindex="1" width="256" height="224" (keydown)="onKeyDown($event)" (keyup)="onKeyUp($event)" [ngStyle]="styleObj"></canvas>
  `,
  styles: ['canvas:focus { outline: none }']
})
export class FamCanvasComponent implements OnInit {
  styleObj: { [key: string]: any } = {
    width: "512px",
    height: "448px"
  };

  @ViewChild("ppuCanvas") ppuCanvas: ElementRef<any>;

  private context2d: CanvasRenderingContext2D;
  private famMachine: FamMachine;

  constructor(private famCanvasService: FamCanvasService) { }

  ngOnInit() {
    this.context2d = this.ppuCanvas.nativeElement.getContext("2d");
  }

  @Input("machine") set machine(mac: FamMachine) {
    if (!mac) {
      return;
    }
    this.famMachine = mac;
    mac.event.subscribe((res: FamResponseMsg) => {
      if (res.screen) {
        let img = this.context2d.createImageData(256, 224);
        img.data.set(new Uint8ClampedArray(res.screen.buffer));
        this.context2d.putImageData(img, 0, 0);
      }
    }, null, () => {
      // End
    });
    this.ppuCanvas.nativeElement.focus();
  }

  @Input("ppuStyle") set style(style: any) {
    if (typeof style == "string") {
      let obj: any = {};
      style.split(";").forEach(st => {
        let ix = st.indexOf(':');
        if (ix) {
          // OK
          let key = st.substring(0, ix).trim();
          let val = st.substring(ix + 1).trim();
          obj[key] = val;
        }
      });
      this.styleObj = Object.assign({}, this.styleObj, obj);
    } else {
      this.styleObj = Object.assign({}, this.styleObj, style);
    }
  }

  onKeyDown($event: KeyboardEvent): void {
    let btn = famKeyConfig[$event.code];
    if (btn && this.famMachine) {
      //console.log($event);
      this.famMachine.press(btn.pad, btn.button);
    }
    $event.preventDefault();
  }
  onKeyUp($event: any): void {
    let btn = famKeyConfig[$event.code];
    //console.log($event);
    if (btn && this.famMachine) {
      this.famMachine.release(btn.pad, btn.button);
    }
    $event.preventDefault();
  }
}
