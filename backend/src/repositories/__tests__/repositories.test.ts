// Empty file for testing repositories locally
import { worldRepository } from '../WorldRepository';

describe('Repository Integration', () => {
  it('should compile and export repositories', () => {
    expect(worldRepository).toBeDefined();
  });
});
