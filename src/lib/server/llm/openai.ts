import { getConfig, missingProviderConfig } from '$lib/server/config';

export interface ProviderMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function requestCompletion(
  messages: ProviderMessage[],
  signal: AbortSignal,
  model = getConfig().openai.model,
  fetcher: typeof fetch = fetch
): Promise<Response> {
  const config = getConfig();
  const missing = missingProviderConfig(config);
  if (missing.length) throw new Error(`Provider unavailable: missing ${missing.join(', ')}`);

  const response = await fetcher(`${config.openai.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.openai.apiKey}`,
      'content-type': 'application/json',
      accept: 'text/event-stream'
    },
    body: JSON.stringify({ model, messages, stream: true }),
    signal
  });
  if (!response.ok || !response.body)
    throw new Error(`Provider request failed (${response.status})`);
  return response;
}

export async function consumeOpenAiStream(
  body: ReadableStream<Uint8Array>,
  onDelta: (text: string) => void
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let completed = false;

  const processLine = (line: string): void => {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith('data:')) return;
    const data = trimmed.slice(5).trim();
    if (data === '[DONE]') {
      completed = true;
      return;
    }
    const parsed = JSON.parse(data) as { choices?: Array<{ delta?: { content?: unknown } }> };
    const content = parsed.choices?.[0]?.delta?.content;
    if (typeof content === 'string') onDelta(content);
  };

  try {
    while (!completed) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) processLine(line);
      if (done) {
        if (buffer) processLine(buffer);
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }
  if (!completed) throw new Error('Provider stream ended before completion');
}
