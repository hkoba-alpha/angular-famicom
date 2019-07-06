import { NgModule } from '@angular/core';
import { FamCanvasComponent } from './fam-canvas.component';
import { CommonModule } from '@angular/common';

@NgModule({
  imports: [
    CommonModule
  ],
  declarations: [FamCanvasComponent],
  exports: [FamCanvasComponent]
})
export class FamCanvasModule { }
