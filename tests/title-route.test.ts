import { beforeEach, describe, expect, it, vi } from 'vitest';

const resolveProviderModel = vi.fn();
const requestTitleCompletion = vi.fn();

vi.mock('../src/lib/server/llm/models', () => ({ resolveProviderModel }));
vi.mock('../src/lib/server/llm/openai', () => ({ requestTitleCompletion }));

const { POST } = await import('../src/routes/api/title/+server');

function event(body: unknown, authenticated = true) {
  return {
    locals: { user: authenticated ? { id: 'alice' } : null },
    request: new Request('http://localhost/api/title', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost' },
      body: JSON.stringify(body)
    })
  } as never;
}

beforeEach(() => {
  vi.restoreAllMocks();
  resolveProviderModel.mockReset();
  requestTitleCompletion.mockReset();
  resolveProviderModel.mockImplementation(async (model) => {
    if (model === 'unknown') throw new Error('Unknown model');
    return typeof model === 'string' && model ? model : 'default-model';
  });
  requestTitleCompletion.mockResolvedValue('Generated title');
});

describe('title generation route', () => {
  it('requires authentication before processing content', async () => {
    const response = await POST(event({ model: 'model', message: 'secret' }, false));
    expect(response.status).toBe(401);
    expect(requestTitleCompletion).not.toHaveBeenCalled();
  });

  it('rejects malformed requests and unavailable models', async () => {
    expect((await POST(event({ model: 'model', message: '   ' }))).status).toBe(400);
    expect((await POST(event({ model: 'unknown', message: 'Message' }))).status).toBe(400);
    expect(requestTitleCompletion).not.toHaveBeenCalled();
  });

  it('returns a normalized title from the allowlisted selected model', async () => {
    requestTitleCompletion.mockResolvedValue('  “Generated\n title”  ');
    const response = await POST(event({ model: 'selected-model', message: 'First message' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ title: 'Generated title' });
    expect(resolveProviderModel).toHaveBeenCalledWith('selected-model');
    expect(requestTitleCompletion).toHaveBeenCalledWith(
      'First message',
      expect.any(AbortSignal),
      'selected-model'
    );
  });

  it('rejects invalid provider output without applying it', async () => {
    requestTitleCompletion.mockResolvedValue('x'.repeat(121));
    const response = await POST(event({ model: 'model', message: 'Message' }));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'Provider returned an invalid title' });
  });

  it('fails open with content-free diagnostics when the provider is unavailable', async () => {
    requestTitleCompletion.mockRejectedValue(new Error('secret message leaked upstream'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await POST(event({ model: 'model', message: 'secret message' }));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'The model provider is unavailable' });
    expect(JSON.stringify(log.mock.calls)).not.toContain('secret message');
  });
});
