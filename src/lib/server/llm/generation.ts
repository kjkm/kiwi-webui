import { validMessage, type ChatRole } from '$lib/chat';

export const MAX_HISTORY_MESSAGES = 256;
export const MAX_HISTORY_CHARACTERS = 512_000;

export interface GenerationMessage {
  role: ChatRole;
  content: string;
}

export interface GenerationRequest {
  conversationId: string;
  model: unknown;
  messages: GenerationMessage[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseGenerationRequest(value: unknown): GenerationRequest | null {
  if (!value || typeof value !== 'object') return null;
  const body = value as Record<string, unknown>;
  if (typeof body.conversationId !== 'string' || !UUID.test(body.conversationId)) return null;
  if (!Array.isArray(body.messages) || body.messages.length < 1) return null;
  if (body.messages.length > MAX_HISTORY_MESSAGES) return null;

  let total = 0;
  const messages: GenerationMessage[] = [];
  for (const item of body.messages) {
    if (!item || typeof item !== 'object') return null;
    const candidate = item as Record<string, unknown>;
    if (candidate.role !== 'user' && candidate.role !== 'assistant') return null;
    if (!validMessage(candidate.content)) return null;
    total += candidate.content.length;
    if (total > MAX_HISTORY_CHARACTERS) return null;
    messages.push({ role: candidate.role, content: candidate.content });
  }
  if (messages.at(-1)?.role !== 'user') return null;
  return { conversationId: body.conversationId, model: body.model, messages };
}
