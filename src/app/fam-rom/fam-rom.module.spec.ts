import { FamRomModule } from './fam-rom.module';

describe('FamRomModule', () => {
  let famRomModule: FamRomModule;

  beforeEach(() => {
    famRomModule = new FamRomModule();
  });

  it('should create an instance', () => {
    expect(famRomModule).toBeTruthy();
  });
});
