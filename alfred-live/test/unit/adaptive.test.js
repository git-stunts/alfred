import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Adaptive } from '../../src/index.js';

describe('Adaptive', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('tracks version and updatedAt', () => {
    const adaptive = new Adaptive('alpha');
    const initialVersion = adaptive.version;
    const initialUpdatedAt = adaptive.updatedAt;

    vi.advanceTimersByTime(100);
    adaptive.set('beta');

    expect(adaptive.get()).toBe('beta');
    expect(adaptive.version).toBe(initialVersion + 1);
    expect(adaptive.updatedAt).toBeGreaterThan(initialUpdatedAt);
  });

  it('updates via updater function', () => {
    const adaptive = new Adaptive(10);

    adaptive.update((value) => value + 5);

    expect(adaptive.get()).toBe(15);
  });
});
