import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { FamCanvasModule } from 'projects/fam-canvas/src/public_api';

@NgModule({
  declarations: [
    AppComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    FamCanvasModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
