export type GenerationStatus = 'loading_model' | 'generating';

export type GenerationEventData =
  | { type: 'status'; status: GenerationStatus }
  | { type: 'delta'; content: string }
  | { type: 'done' }
  | { type: 'error'; error: string };

export interface SequencedGenerationEvent {
  sequence: number;
  data: GenerationEventData;
}

export function formatGenerationEvent(event: SequencedGenerationEvent): string {
  return `id: ${event.sequence}\ndata: ${JSON.stringify(event.data)}\n\n`;
}

export function parseEventSequence(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const sequence = Number(value);
  return Number.isSafeInteger(sequence) && sequence >= 0 ? sequence : null;
}

export function parseGenerationEvent(raw: string): SequencedGenerationEvent | null {
  let sequence: number | null = null;
  let data: unknown;
  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith('id:')) sequence = parseEventSequence(line.slice(3).trim());
    if (line.startsWith('data:')) {
      try {
        data = JSON.parse(line.slice(5).trim());
      } catch {
        return null;
      }
    }
  }
  if (sequence === null || !data || typeof data !== 'object') return null;
  const value = data as Record<string, unknown>;
  if (
    value.type === 'status' &&
    (value.status === 'loading_model' || value.status === 'generating')
  ) {
    return { sequence, data: { type: 'status', status: value.status } };
  }
  if (value.type === 'delta' && typeof value.content === 'string' && value.content.length > 0) {
    return { sequence, data: { type: 'delta', content: value.content } };
  }
  if (value.type === 'done') return { sequence, data: { type: 'done' } };
  if (value.type === 'error' && typeof value.error === 'string' && value.error.length > 0) {
    return { sequence, data: { type: 'error', error: value.error } };
  }
  return null;
}
