import { TestBed } from '@angular/core/testing';

import { FamCanvasService } from './fam-canvas.service';

describe('FamCanvasService', () => {
  beforeEach(() => TestBed.configureTestingModule({}));

  it('should be created', () => {
    const service: FamCanvasService = TestBed.get(FamCanvasService);
    expect(service).toBeTruthy();
  });
});
