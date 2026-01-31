
import { describe, it, expect, vi } from 'vitest';
import { InMemorySink, ConsoleSink, MultiSink, NoopSink } from '../../src/telemetry.js';

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
});
