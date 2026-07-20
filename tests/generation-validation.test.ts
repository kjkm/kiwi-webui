import { describe, expect, it } from 'vitest';
import {
  MAX_HISTORY_CHARACTERS,
  MAX_HISTORY_MESSAGES,
  parseGenerationRequest
} from '../src/lib/server/llm/generation';

const conversationId = '00000000-0000-4000-8000-000000000001';

const request = (messages: unknown, model: unknown = 'model') => ({
  conversationId,
  model,
  messages
});

describe('generation request validation', () => {
  it('accepts bounded ordered history ending in a user message', () => {
    expect(
      parseGenerationRequest(
        request([
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: 'hi' },
          { role: 'user', content: 'again' }
        ])
      )
    ).toMatchObject({ conversationId, model: 'model' });
  });

  it('rejects invalid IDs, roles, content, and terminal assistant messages', () => {
    expect(
      parseGenerationRequest({ ...request([{ role: 'user', content: 'x' }]), conversationId: 'x' })
    ).toBeNull();
    expect(parseGenerationRequest(request([{ role: 'system', content: 'x' }]))).toBeNull();
    expect(parseGenerationRequest(request([{ role: 'user', content: '   ' }]))).toBeNull();
    expect(parseGenerationRequest(request([{ role: 'assistant', content: 'x' }]))).toBeNull();
  });

  it('rejects excessive message count and aggregate content', () => {
    expect(
      parseGenerationRequest(
        request(
          Array.from({ length: MAX_HISTORY_MESSAGES + 1 }, () => ({ role: 'user', content: 'x' }))
        )
      )
    ).toBeNull();
    const chunk = 'x'.repeat(32000);
    const messages = Array.from(
      { length: Math.ceil(MAX_HISTORY_CHARACTERS / chunk.length) + 1 },
      (_, index) => ({
        role: index % 2 ? 'assistant' : 'user',
        content: chunk
      })
    );
    messages[messages.length - 1].role = 'user';
    expect(parseGenerationRequest(request(messages))).toBeNull();
  });
});
