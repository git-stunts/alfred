/**
 * Jitter strategies to prevent thundering herd problems.
 *
 * @see https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
 */

/**
 * No jitter - returns delay unchanged.
 * @param {number} delay - Base delay
 * @returns {number}
 */
export function noJitter(delay) {
  return delay;
}

/**
 * Full jitter - random delay between 0 and calculated delay.
 * Most aggressive randomization, best for reducing collisions.
 * @param {number} delay - Base delay
 * @param {() => number} [random=Math.random] - Random function (0-1)
 * @returns {number}
 */
export function fullJitter(delay, random = Math.random) {
  return Math.floor(random() * delay);
}

/**
 * Equal jitter - delay between 50% and 100% of calculated delay.
 * Balances spread with guaranteed minimum delay.
 * @param {number} delay - Base delay
 * @param {() => number} [random=Math.random] - Random function (0-1)
 * @returns {number}
 */
export function equalJitter(delay, random = Math.random) {
  const half = delay / 2;
  return Math.floor(half + random() * half);
}

/**
 * Decorrelated jitter - AWS-style stateful jitter.
 * Each delay is random between base delay and 3x previous delay.
 * Creates a random walk with bounds.
 * @param {number} baseDelay - Minimum delay
 * @param {number} prevDelay - Previous delay (or baseDelay for first)
 * @param {number} maxDelay - Maximum delay cap
 * @param {() => number} [random=Math.random] - Random function (0-1)
 * @returns {number}
 */
// eslint-disable-next-line max-params
export function decorrelatedJitter(baseDelay, prevDelay, maxDelay, random = Math.random) {
  const next = Math.floor(random() * (prevDelay * 3 - baseDelay)) + baseDelay;
  return Math.min(next, maxDelay);
}

/**
 * Creates a jitter function based on strategy name.
 * @param {'none' | 'full' | 'equal' | 'decorrelated'} strategy
 * @param {() => number} [random=Math.random]
 * @returns {(delay: number, prevDelay?: number, maxDelay?: number) => number}
 */
export function createJitter(strategy, random = Math.random) {
  switch (strategy) {
    case 'full':
      return (delay) => fullJitter(delay, random);
    case 'equal':
      return (delay) => equalJitter(delay, random);
    case 'decorrelated':
      return (delay, prevDelay, maxDelay) =>
        decorrelatedJitter(delay, prevDelay || delay, maxDelay || delay * 10, random);
    case 'none':
    default:
      return noJitter;
  }
}
