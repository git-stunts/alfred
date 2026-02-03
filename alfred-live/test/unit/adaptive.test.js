import { describe, it, expect } from 'vitest';
import { Adaptive } from '../../src/index.js';

describe('Adaptive', () => {
  it('tracks version and updatedAt', () => {
    const adaptive = new Adaptive('alpha');
    const initialVersion = adaptive.version;
    const initialUpdatedAt = adaptive.updatedAt;

    adaptive.set('beta');

    expect(adaptive.get()).toBe('beta');
    expect(adaptive.version).toBe(initialVersion + 1);
    expect(adaptive.updatedAt).toBeGreaterThanOrEqual(initialUpdatedAt);
  });

  it('updates via updater function', () => {
    const adaptive = new Adaptive(10);

    adaptive.update((value) => value + 5);

    expect(adaptive.get()).toBe(15);
  });
});
