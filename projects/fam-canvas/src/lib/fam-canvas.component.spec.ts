import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { FamCanvasComponent } from './fam-canvas.component';

describe('FamCanvasComponent', () => {
  let component: FamCanvasComponent;
  let fixture: ComponentFixture<FamCanvasComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ FamCanvasComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(FamCanvasComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
