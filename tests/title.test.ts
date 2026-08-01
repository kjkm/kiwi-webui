import { describe, expect, it } from 'vitest';
import { TITLE_MAX } from '../src/lib/chat';
import { normalizeGeneratedTitle, parseTitleRequest } from '../src/lib/server/llm/title';

describe('title generation validation', () => {
  it('accepts one bounded user message and opaque model selection', () => {
    expect(parseTitleRequest({ model: 'model', message: 'Name this conversation' })).toEqual({
      model: 'model',
      message: 'Name this conversation'
    });
  });

  it('rejects malformed, empty, and excessive requests', () => {
    expect(parseTitleRequest(null)).toBeNull();
    expect(parseTitleRequest({ model: 'model', message: '   ' })).toBeNull();
    expect(parseTitleRequest({ model: 'model', message: 'x'.repeat(32_001) })).toBeNull();
  });

  it('normalizes whitespace and one surrounding quote pair', () => {
    expect(normalizeGeneratedTitle('  “A\n  concise   title”  ')).toBe('A concise title');
    expect(normalizeGeneratedTitle("'Another title'")).toBe('Another title');
  });

  it('rejects invalid output and preserves plain markup-like text', () => {
    expect(normalizeGeneratedTitle(undefined)).toBeNull();
    expect(normalizeGeneratedTitle('  ')).toBeNull();
    expect(normalizeGeneratedTitle('x'.repeat(TITLE_MAX + 1))).toBeNull();
    expect(normalizeGeneratedTitle('<b>Plain title</b>')).toBe('<b>Plain title</b>');
  });
});
