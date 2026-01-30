/**
 * @typedef {Object} Policy
 * @property {<T>(fn: () => Promise<T>) => Promise<T>} execute - Executes the function with the policy applied
 */

/**
 * Composes multiple policies into a single policy.
 *
 * Policies are applied from outermost to innermost. The first policy wraps
 * the second, which wraps the third, and so on. Each policy's execute method
 * receives a function that invokes the next policy in the chain.
 *
 * @param {...Policy} policies - Policies to compose (outer to inner order)
 * @returns {Policy} - Combined policy
 *
 * @example
 * const resilient = compose(
 *   { execute: (fn) => timeout(5000, fn) },
 *   { execute: (fn) => retry(fn, { retries: 3 }) }
 * );
 * // timeout wraps retry: timeout(5000, () => retry(fn, { retries: 3 }))
 * await resilient.execute(() => fetch(url));
 */
export function compose(...policies) {
  if (policies.length === 0) {
    return {
      execute: (fn) => fn()
    };
  }

  return {
    /**
     * @template T
     * @param {() => Promise<T>} fn - Function to execute
     * @returns {Promise<T>}
     */
    execute(fn) {
      // Build the chain from innermost to outermost
      // policies[0] is outermost, policies[n-1] is innermost
      let chain = fn;

      for (let i = policies.length - 1; i >= 0; i--) {
        const policy = policies[i];
        const next = chain;
        chain = () => policy.execute(next);
      }

      return chain();
    }
  };
}

/**
 * Creates a fallback policy that tries a secondary policy if the primary fails.
 *
 * @param {Policy} primary - Primary policy to attempt first
 * @param {Policy} secondary - Secondary policy to attempt on failure
 * @returns {Policy} - Fallback policy
 *
 * @example
 * const withFallback = fallback(
 *   { execute: (fn) => fastCache.get(key) ?? fn() },
 *   { execute: (fn) => slowDatabase.get(key) ?? fn() }
 * );
 * await withFallback.execute(() => computeExpensiveValue());
 */
export function fallback(primary, secondary) {
  return {
    /**
     * @template T
     * @param {() => Promise<T>} fn - Function to execute
     * @returns {Promise<T>}
     */
    async execute(fn) {
      try {
        return await primary.execute(fn);
      } catch {
        return await secondary.execute(fn);
      }
    }
  };
}

/**
 * Creates a racing policy that runs two policies concurrently.
 *
 * Returns the result of whichever policy succeeds first.
 * If both fail, throws the error from the first policy.
 *
 * @param {Policy} policyA - First policy to race
 * @param {Policy} policyB - Second policy to race
 * @returns {Policy} - Racing policy
 *
 * @example
 * const fastest = race(
 *   { execute: (fn) => primaryServer.fetch(url) },
 *   { execute: (fn) => backupServer.fetch(url) }
 * );
 * await fastest.execute(() => defaultFetch(url));
 */
export function race(policyA, policyB) {
  return {
    /**
     * @template T
     * @param {() => Promise<T>} fn - Function to execute
     * @returns {Promise<T>}
     */
    async execute(fn) {
      /** @type {Error | null} */
      let firstError = null;
      let errorCount = 0;

      const wrapWithErrorTracking = (promise, isFirst) => {
        return promise.catch((error) => {
          if (isFirst) {
            firstError = error;
          }
          errorCount++;

          // Return a promise that never resolves
          // This allows the other policy to potentially succeed
          return new Promise(() => {});
        });
      };

      const promiseA = wrapWithErrorTracking(policyA.execute(fn), true);
      const promiseB = wrapWithErrorTracking(policyB.execute(fn), false);

      // Race both policies
      const result = await Promise.race([
        promiseA,
        promiseB,
        // Also race against a check for both failing
        Promise.all([
          policyA.execute(fn).catch((e) => ({ __failed: true, error: e, isFirst: true })),
          policyB.execute(fn).catch((e) => ({ __failed: true, error: e, isFirst: false }))
        ]).then((results) => {
          // If we get here, both have completed (failed or succeeded)
          const failures = results.filter((r) => r && r.__failed);
          if (failures.length === 2) {
            // Both failed - throw first error
            const firstFailure = failures.find((f) => f.isFirst);
            throw firstFailure.error;
          }
          // At least one succeeded, but Promise.race should have caught it
          // This shouldn't normally be reached
          return results.find((r) => !r || !r.__failed);
        })
      ]);

      return result;
    }
  };
}
