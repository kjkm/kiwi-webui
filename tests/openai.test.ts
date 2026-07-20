import { describe, expect, it } from 'vitest';
import { consumeOpenAiStream } from '../src/lib/server/llm/openai';

function body(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    }
  });
}

describe('OpenAI-compatible stream parser', () => {
  it('handles split SSE chunks', async () => {
    let text = '';
    await consumeOpenAiStream(
      body(['data: {"choices":[{"delta":{"content":"hel', 'lo"}}]}\n\ndata: [DONE]\n\n']),
      (delta) => (text += delta)
    );
    expect(text).toBe('hello');
  });

  it('rejects malformed and incomplete streams', async () => {
    await expect(consumeOpenAiStream(body(['data: nope\n\n']), () => {})).rejects.toThrow();
    await expect(consumeOpenAiStream(body(['data: {"choices":[]}\n\n']), () => {})).rejects.toThrow(
      /before completion/
    );
  });
});
