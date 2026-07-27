import type { GenerationMessage } from '$lib/server/llm/generation';
import type { GenerationJob } from '$lib/server/llm/generation-jobs';
import { ensureOllamaModelReady } from '$lib/server/llm/ollama';
import { consumeOpenAiStream, requestCompletion } from '$lib/server/llm/openai';

interface GenerationRunnerDependencies {
  ensureModel?: typeof ensureOllamaModelReady;
  request?: typeof requestCompletion;
  consume?: typeof consumeOpenAiStream;
}

export async function runGenerationJob(
  job: GenerationJob,
  messages: GenerationMessage[],
  {
    ensureModel = ensureOllamaModelReady,
    request = requestCompletion,
    consume = consumeOpenAiStream
  }: GenerationRunnerDependencies = {}
): Promise<void> {
  let inferenceStarted = false;
  let hasNonWhitespaceOutput = false;
  try {
    await ensureModel(job.model, {
      signal: job.abortController.signal,
      onLoading: () => job.append({ type: 'status', status: 'loading_model' })
    });
    if (job.state !== 'running') return;

    job.append({ type: 'status', status: 'generating' });
    const upstream = await request(messages, job.abortController.signal, job.model);
    messages.length = 0;
    if (job.state !== 'running') return;
    inferenceStarted = true;

    await consume(upstream.body!, (text) => {
      if (text.trim()) hasNonWhitespaceOutput = true;
      if (!job.append({ type: 'delta', content: text })) {
        throw new Error('Generation job is no longer accepting output');
      }
    });
    if (!hasNonWhitespaceOutput) throw new Error('Provider returned an empty response');
    job.append({ type: 'done' });
  } catch {
    messages.length = 0;
    if (job.state !== 'running' || job.abortController.signal.aborted) return;
    console.error(inferenceStarted ? 'Completion stream failed' : 'Completion request failed');
    job.fail(
      inferenceStarted ? 'The response was interrupted' : 'The model provider is unavailable'
    );
  }
}
