import { describe, expect, it } from 'vitest';
import { parseEventSequence, parseGenerationEvent } from '../src/lib/generation-events';

describe('generation event protocol', () => {
  it('parses typed sequenced events', () => {
    expect(
      parseGenerationEvent('id: 3\ndata: {"type":"status","status":"loading_model"}\n')
    ).toEqual({ sequence: 3, data: { type: 'status', status: 'loading_model' } });
    expect(parseGenerationEvent('id: 4\ndata: {"type":"delta","content":"hello"}\n')).toEqual({
      sequence: 4,
      data: { type: 'delta', content: 'hello' }
    });
    expect(parseGenerationEvent('id: 5\ndata: {"type":"done"}\n')).toEqual({
      sequence: 5,
      data: { type: 'done' }
    });
  });

  it('rejects malformed sequence identifiers and payloads', () => {
    expect(parseEventSequence('0')).toBe(0);
    expect(parseEventSequence('-1')).toBeNull();
    expect(parseEventSequence('1.5')).toBeNull();
    expect(parseEventSequence(String(Number.MAX_SAFE_INTEGER + 1))).toBeNull();
    expect(parseGenerationEvent('data: {"type":"done"}\n')).toBeNull();
    expect(parseGenerationEvent('id: 1\ndata: {"type":"delta","content":""}\n')).toBeNull();
    expect(parseGenerationEvent('id: 1\ndata: nope\n')).toBeNull();
  });
});
