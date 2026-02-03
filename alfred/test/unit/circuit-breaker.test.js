import { describe, it, expect, vi } from 'vitest';
import { circuitBreaker } from '../../src/policies/circuit-breaker.js';
import { TestClock } from '../../src/utils/clock.js';
import { CircuitOpenError } from '../../src/errors.js';

describe('circuitBreaker', () => {
  describe('initial state', () => {
    it('starts in CLOSED state', () => {
      const breaker = circuitBreaker({ threshold: 3, duration: 1000 });

      expect(breaker.state).toBe('CLOSED');
    });

    it('requires threshold option', () => {
      expect(() => circuitBreaker({ duration: 1000 })).toThrow('threshold is required');
    });

    it('requires duration option', () => {
      expect(() => circuitBreaker({ threshold: 3 })).toThrow('duration is required');
    });
  });

  describe('state transitions', () => {
    it('opens after threshold failures', async () => {
      const breaker = circuitBreaker({ threshold: 3, duration: 1000 });
      const fn = vi.fn().mockRejectedValue(new Error('fail'));

      // First failure
      await expect(breaker.execute(fn)).rejects.toThrow('fail');
      expect(breaker.state).toBe('CLOSED');

      // Second failure
      await expect(breaker.execute(fn)).rejects.toThrow('fail');
      expect(breaker.state).toBe('CLOSED');

      // Third failure - should open
      await expect(breaker.execute(fn)).rejects.toThrow('fail');
      expect(breaker.state).toBe('OPEN');
    });

    it('throws CircuitOpenError when open', async () => {
      const breaker = circuitBreaker({ threshold: 1, duration: 1000 });
      const fn = vi.fn().mockRejectedValue(new Error('fail'));

      // Trigger opening
      await expect(breaker.execute(fn)).rejects.toThrow('fail');
      expect(breaker.state).toBe('OPEN');

      // Should throw CircuitOpenError without calling fn
      await expect(breaker.execute(fn)).rejects.toThrow(CircuitOpenError);

      // fn should only have been called once (before circuit opened)
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('transitions to HALF_OPEN after duration', async () => {
      const clock = new TestClock();
      const breaker = circuitBreaker({
        threshold: 1,
        duration: 5000,
        clock,
      });
      const fn = vi.fn().mockRejectedValue(new Error('fail'));

      // Open the circuit
      await expect(breaker.execute(fn)).rejects.toThrow('fail');
      expect(breaker.state).toBe('OPEN');

      // Advance time past duration
      clock.setTime(6000);

      // Next execution attempt should transition to HALF_OPEN
      fn.mockRejectedValueOnce(new Error('still failing'));
      await expect(breaker.execute(fn)).rejects.toThrow('still failing');
      // After failure in HALF_OPEN, it goes back to OPEN
      expect(breaker.state).toBe('OPEN');
    });

    it('closes on success in HALF_OPEN', async () => {
      const clock = new TestClock();
      const breaker = circuitBreaker({
        threshold: 1,
        duration: 5000,
        clock,
      });
      const fn = vi.fn().mockRejectedValueOnce(new Error('fail'));

      // Open the circuit
      await expect(breaker.execute(fn)).rejects.toThrow('fail');
      expect(breaker.state).toBe('OPEN');

      // Advance time past duration
      clock.setTime(6000);

      // Next execution should succeed and close circuit
      fn.mockResolvedValueOnce('success');
      const result = await breaker.execute(fn);

      expect(result).toBe('success');
      expect(breaker.state).toBe('CLOSED');
    });

    it('reopens on failure in HALF_OPEN', async () => {
      const clock = new TestClock();
      const breaker = circuitBreaker({
        threshold: 1,
        duration: 5000,
        clock,
      });
      const fn = vi.fn().mockRejectedValue(new Error('fail'));

      // Open the circuit
      await expect(breaker.execute(fn)).rejects.toThrow('fail');
      expect(breaker.state).toBe('OPEN');

      // Advance time past duration
      clock.setTime(6000);

      // Next execution fails in HALF_OPEN
      await expect(breaker.execute(fn)).rejects.toThrow('fail');
      expect(breaker.state).toBe('OPEN');
    });

    it('respects successThreshold in HALF_OPEN', async () => {
      const clock = new TestClock();
      const breaker = circuitBreaker({
        threshold: 1,
        duration: 5000,
        successThreshold: 2,
        clock,
      });
      const fn = vi.fn().mockRejectedValueOnce(new Error('fail'));

      // Open the circuit
      await expect(breaker.execute(fn)).rejects.toThrow('fail');
      expect(breaker.state).toBe('OPEN');

      // Advance time past duration
      clock.setTime(6000);

      // First success in HALF_OPEN
      fn.mockResolvedValueOnce('success 1');
      await breaker.execute(fn);
      expect(breaker.state).toBe('HALF_OPEN');

      // Second success should close
      fn.mockResolvedValueOnce('success 2');
      await breaker.execute(fn);
      expect(breaker.state).toBe('CLOSED');
    });
  });

  describe('shouldTrip predicate', () => {
    it('only counts errors matching predicate', async () => {
      const breaker = circuitBreaker({
        threshold: 2,
        duration: 1000,
        shouldTrip: (error) => error.status >= 500,
      });

      const clientError = new Error('client error');
      clientError.status = 400;

      const serverError = new Error('server error');
      serverError.status = 500;

      const fn = vi.fn();

      // Client error - should not count
      fn.mockRejectedValueOnce(clientError);
      await expect(breaker.execute(fn)).rejects.toThrow('client error');
      expect(breaker.state).toBe('CLOSED');

      // Another client error - still should not count
      fn.mockRejectedValueOnce(clientError);
      await expect(breaker.execute(fn)).rejects.toThrow('client error');
      expect(breaker.state).toBe('CLOSED');

      // Server error - should count
      fn.mockRejectedValueOnce(serverError);
      await expect(breaker.execute(fn)).rejects.toThrow('server error');
      expect(breaker.state).toBe('CLOSED');

      // Another server error - should trip
      fn.mockRejectedValueOnce(serverError);
      await expect(breaker.execute(fn)).rejects.toThrow('server error');
      expect(breaker.state).toBe('OPEN');
    });

    it('filters errors in HALF_OPEN state', async () => {
      const clock = new TestClock();
      const breaker = circuitBreaker({
        threshold: 1,
        duration: 5000,
        clock,
        shouldTrip: (error) => error.status >= 500,
      });

      const serverError = new Error('server error');
      serverError.status = 500;

      const clientError = new Error('client error');
      clientError.status = 400;

      const fn = vi.fn();

      // Open with server error
      fn.mockRejectedValueOnce(serverError);
      await expect(breaker.execute(fn)).rejects.toThrow('server error');
      expect(breaker.state).toBe('OPEN');

      // Advance time to HALF_OPEN
      clock.setTime(6000);

      // Client error in HALF_OPEN - should not reopen
      fn.mockRejectedValueOnce(clientError);
      await expect(breaker.execute(fn)).rejects.toThrow('client error');
      // Should still be in HALF_OPEN (not reopened)
      expect(breaker.state).toBe('HALF_OPEN');
    });
  });

  describe('callbacks', () => {
    it('calls onOpen when circuit opens', async () => {
      const onOpen = vi.fn();
      const breaker = circuitBreaker({
        threshold: 1,
        duration: 1000,
        onOpen,
      });

      const fn = vi.fn().mockRejectedValue(new Error('fail'));

      await expect(breaker.execute(fn)).rejects.toThrow('fail');

      expect(onOpen).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when circuit closes', async () => {
      const clock = new TestClock();
      const onClose = vi.fn();
      const breaker = circuitBreaker({
        threshold: 1,
        duration: 5000,
        clock,
        onClose,
      });

      const fn = vi.fn().mockRejectedValueOnce(new Error('fail'));

      // Open the circuit
      await expect(breaker.execute(fn)).rejects.toThrow('fail');

      // Advance time past duration
      clock.setTime(6000);

      // Succeed to close
      fn.mockResolvedValueOnce('success');
      await breaker.execute(fn);

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onHalfOpen when circuit transitions to half-open', async () => {
      const clock = new TestClock();
      const onHalfOpen = vi.fn();
      const breaker = circuitBreaker({
        threshold: 1,
        duration: 5000,
        clock,
        onHalfOpen,
      });

      const fn = vi.fn().mockRejectedValueOnce(new Error('fail'));

      // Open the circuit
      await expect(breaker.execute(fn)).rejects.toThrow('fail');
      expect(onHalfOpen).not.toHaveBeenCalled();

      // Advance time past duration
      clock.setTime(6000);

      // Next execute will transition to HALF_OPEN
      fn.mockResolvedValueOnce('success');
      await breaker.execute(fn);

      expect(onHalfOpen).toHaveBeenCalledTimes(1);
    });

    it('calls callbacks in correct order during full cycle', async () => {
      const clock = new TestClock();
      const callOrder = [];
      const breaker = circuitBreaker({
        threshold: 1,
        duration: 5000,
        clock,
        onOpen: () => callOrder.push('onOpen'),
        onHalfOpen: () => callOrder.push('onHalfOpen'),
        onClose: () => callOrder.push('onClose'),
      });

      const fn = vi.fn();

      // Open
      fn.mockRejectedValueOnce(new Error('fail'));
      await expect(breaker.execute(fn)).rejects.toThrow('fail');

      // Advance to half-open
      clock.setTime(6000);

      // Close with success
      fn.mockResolvedValueOnce('success');
      await breaker.execute(fn);

      expect(callOrder).toEqual(['onOpen', 'onHalfOpen', 'onClose']);
    });
  });

  describe('failure count reset', () => {
    it('resets failure count on success in CLOSED state', async () => {
      const breaker = circuitBreaker({ threshold: 3, duration: 1000 });
      const fn = vi.fn();

      // Two failures
      fn.mockRejectedValueOnce(new Error('fail 1'));
      await expect(breaker.execute(fn)).rejects.toThrow('fail 1');
      fn.mockRejectedValueOnce(new Error('fail 2'));
      await expect(breaker.execute(fn)).rejects.toThrow('fail 2');

      // Success should reset count
      fn.mockResolvedValueOnce('success');
      await breaker.execute(fn);

      // Two more failures should not trip
      fn.mockRejectedValueOnce(new Error('fail 3'));
      await expect(breaker.execute(fn)).rejects.toThrow('fail 3');
      fn.mockRejectedValueOnce(new Error('fail 4'));
      await expect(breaker.execute(fn)).rejects.toThrow('fail 4');

      expect(breaker.state).toBe('CLOSED');

      // Third consecutive failure should trip
      fn.mockRejectedValueOnce(new Error('fail 5'));
      await expect(breaker.execute(fn)).rejects.toThrow('fail 5');
      expect(breaker.state).toBe('OPEN');
    });
  });

  describe('CircuitOpenError details', () => {
    it('includes openedAt and failureCount', async () => {
      const clock = new TestClock();
      clock.setTime(1000);

      const breaker = circuitBreaker({
        threshold: 2,
        duration: 5000,
        clock,
      });

      const fn = vi.fn().mockRejectedValue(new Error('fail'));

      // Trip the circuit
      await expect(breaker.execute(fn)).rejects.toThrow('fail');
      await expect(breaker.execute(fn)).rejects.toThrow('fail');

      // Now try to execute while open
      try {
        await breaker.execute(fn);
      } catch (e) {
        expect(e).toBeInstanceOf(CircuitOpenError);
        expect(e.openedAt.getTime()).toBe(1000);
        expect(e.failureCount).toBe(2);
        expect(e.message).toContain('Circuit breaker is open');
      }
    });
  });
});
