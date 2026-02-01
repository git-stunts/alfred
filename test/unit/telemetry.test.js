
import { describe, it, expect, vi } from 'vitest';
import { 
  InMemorySink, 
  ConsoleSink, 
  MultiSink, 
  NoopSink, 
  MetricsSink 
} from '../../src/index.js';

describe('Telemetry', () => {
  describe('InMemorySink', () => {
    it('stores events', () => {
      const sink = new InMemorySink();
      sink.emit({ type: 'test', foo: 'bar' });
      
      expect(sink.events).toHaveLength(1);
      expect(sink.events[0]).toEqual({ type: 'test', foo: 'bar' });
    });

    it('can clear events', () => {
      const sink = new InMemorySink();
      sink.emit({ type: 'test' });
      sink.clear();
      expect(sink.events).toHaveLength(0);
    });
  });

  describe('ConsoleSink', () => {
    it('logs to console', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const sink = new ConsoleSink();
      
      sink.emit({ type: 'test', val: 1 });
      
      expect(spy).toHaveBeenCalled();
      expect(spy.mock.calls[0][0]).toContain('[test]');
      spy.mockRestore();
    });
  });

  describe('MultiSink', () => {
    it('broadcasts to multiple sinks', () => {
      const sink1 = new InMemorySink();
      const sink2 = new InMemorySink();
      const multi = new MultiSink([sink1, sink2]);
      
      multi.emit({ type: 'test' });
      
      expect(sink1.events).toHaveLength(1);
      expect(sink2.events).toHaveLength(1);
    });
  });

  describe('NoopSink', () => {
    it('does nothing', () => {
      const sink = new NoopSink();
      expect(() => sink.emit({ type: 'test' })).not.toThrow();
    });
  });

  describe('MetricsSink', () => {
    it('counts events correctly via semantic metrics', () => {
      const sink = new MetricsSink();
      
      sink.emit({ type: 'test', metrics: { retries: 1, failures: 1 } });
      sink.emit({ type: 'test', metrics: { circuitBreaks: 1 } });
      sink.emit({ type: 'test', metrics: { bulkheadRejections: 1 } });
      sink.emit({ type: 'test', metrics: { timeouts: 1 } });
      sink.emit({ type: 'test', metrics: { hedges: 1 } });
      sink.emit({ type: 'test', metrics: { custom: 5 } });
      
      expect(sink.stats).toMatchObject({
        retries: 1,
        failures: 1,
        circuitBreaks: 1,
        bulkheadRejections: 1,
        timeouts: 1,
        hedges: 1,
        custom: 5
      });
    });

    it('aggregates latency', () => {
      const sink = new MetricsSink();
      
      sink.emit({ type: 'success', duration: 10 });
      sink.emit({ type: 'success', duration: 30 });
      sink.emit({ type: 'failure', duration: 20 });
      
      const { latency } = sink.stats;
      expect(latency).toMatchObject({
        count: 3,
        sum: 60,
        min: 10,
        max: 30,
        avg: 20
      });
    });

    it('ignores invalid latency values', () => {
      const sink = new MetricsSink();
      
      sink.emit({ type: 'test', duration: -10 });
      sink.emit({ type: 'test', duration: NaN });
      sink.emit({ type: 'test', duration: Infinity });
      sink.emit({ type: 'test', duration: '10' });
      
      expect(sink.stats.latency.count).toBe(0);
    });

    it('normalizes empty latency state', () => {
      const sink = new MetricsSink();
      expect(sink.stats.latency).toEqual({
        count: 0,
        sum: 0,
        min: 0,
        max: 0,
        avg: 0
      });
    });

    it('can be cleared', () => {
      const sink = new MetricsSink();
      sink.emit({ type: 'test', metrics: { custom: 1 } });
      expect(sink.stats.custom).toBe(1);
      
      sink.clear();
      expect(sink.stats.custom).toBeUndefined();
      expect(sink.stats.latency.count).toBe(0);
    });
  });
});
